begin;
alter table public.sales_orders
 add column if not exists order_status text not null default 'Pending',
 add column if not exists archived_at timestamptz,
 add column if not exists status_before_archive text;
create index if not exists sales_orders_lifecycle_idx on public.sales_orders (order_status, created_at desc) where archived_at is null;

create or replace function public.change_order_lifecycle(p_id uuid, p_version integer, p_action text, p_status text, p_confirmation text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.sales_orders; s text;
begin
 select * into o from public.sales_orders where id=p_id for update;
 if not found then raise exception using errcode='P0002', message='Order not found.'; end if;
 if o.edit_version <> p_version then raise exception using errcode='40001', message='This order changed. Close it and refresh before trying again.'; end if;
 if p_action='restore' then
  if o.archived_at is null or clock_timestamp() >= o.archived_at + interval '72 hours' then
   raise exception using errcode='22023', message='The 72-hour recovery period has ended, or this order is not archived.';
  end if;
  update public.sales_orders set archived_at=null, order_status=coalesce(status_before_archive,'Pending'), status_before_archive=null, edit_version=edit_version+1, updated_at=now() where id=p_id;
 else
  if o.archived_at is not null then raise exception using errcode='22023', message='Restore the archived order before changing it.'; end if;
  if p_action='archive' then
   if o.order_status <> 'Completed' and p_confirmation is distinct from 'Cancel order' then
    raise exception using errcode='22023', message='Type Cancel order to cancel and archive an unfinished order.';
   end if;
   update public.sales_orders set status_before_archive=order_status, order_status=case when order_status='Completed' then 'Completed' else 'Cancelled' end, archived_at=clock_timestamp(), edit_version=edit_version+1, updated_at=now() where id=p_id;
  elsif p_action='status' then
   s=btrim(p_status);
   if s is null or length(s)=0 or length(s)>80 then raise exception using errcode='22023', message='Enter a status between 1 and 80 characters.'; end if;
   if lower(s)='completed' then s='Completed'; end if;
   update public.sales_orders set order_status=s, edit_version=edit_version+1, updated_at=now() where id=p_id;
  else raise exception using errcode='22023', message='Unknown order action.';
  end if;
 end if;
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.change_order_lifecycle(uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.change_order_lifecycle(uuid,integer,text,text,text) to service_role;

-- Prevent item edits on archived orders, including requests from a stale Edit form.
create or replace function public.guard_archived_order_items()
returns trigger language plpgsql set search_path='' as $$
declare archived timestamptz;
begin
 select archived_at into archived from public.sales_orders where id=coalesce(new.order_id,old.order_id) for update;
 if archived is not null then raise exception using errcode='22023',message='Archived orders cannot be edited. Restore the order first.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists guard_archived_items on public.sales_order_items;
create trigger guard_archived_items before insert or update or delete on public.sales_order_items for each row execute function public.guard_archived_order_items();

-- Preserve the existing dashboard response, replacing order statistics and lists.
create or replace function public.get_admin_dashboard_v2()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; stats jsonb; recent jsonb; statuses jsonb;
begin
 result=public.get_admin_dashboard()::jsonb;
 select jsonb_build_object(
  'orders',count(*),
  'open_orders',count(*) filter(where order_status<>'Completed'),
  'completed_orders',count(*) filter(where order_status='Completed')
 ) into stats from public.sales_orders where archived_at is null;
 select stats || jsonb_build_object('ordered',coalesce(sum(i.order_qty_lbs),0),'dispatched',coalesce(sum(i.dispatched_qty_lbs),0),'remaining',coalesce(sum(i.balance_qty_lbs),0)) into stats
 from public.sales_order_items i join public.sales_orders o on o.id=i.order_id where o.archived_at is null;
 select coalesce(jsonb_agg(t.data order by t.created_at desc,t.id desc),'[]'::jsonb) into recent from (
  select o.id,o.created_at,to_jsonb(o)||jsonb_build_object('customers',(select jsonb_build_object('id',c.id,'code',c.code,'name',c.name) from public.customers c where c.id=o.customer_id),'sales_order_items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.sales_order_items i where i.order_id=o.id)) data
  from public.sales_orders o where o.archived_at is null order by o.created_at desc,o.id desc limit 5
 ) t;
 select coalesce(jsonb_agg(jsonb_build_object('status',s.order_status,'count',s.n)),'[]'::jsonb) into statuses from (select order_status,count(*) n from public.sales_orders where archived_at is null group by order_status) s;
 return result || jsonb_build_object('stats',(result->'stats')||stats,'recent_orders',recent,'statuses',statuses);
end $$;
revoke all on function public.get_admin_dashboard_v2() from public,anon,authenticated;
grant execute on function public.get_admin_dashboard_v2() to service_role;

-- Customer document search excludes archived orders; admin keeps historical access.
create or replace function public.search_order_documents_v2(p_customer_id uuid, p_search text, p_order_number text, p_offset integer, p_limit integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with matches as (
  select d.id,d.order_id,d.name,d.original_filename,d.size_bytes,d.created_at,o.sales_order_no,c.name customer_name
  from public.order_documents d join public.sales_orders o on o.id=d.order_id join public.customers c on c.id=o.customer_id
  where (p_customer_id is null or (o.customer_id=p_customer_id and o.archived_at is null))
   and (coalesce(p_search,'')='' or strpos(lower(d.name||' '||d.original_filename),lower(p_search))>0)
   and (coalesce(p_order_number,'')='' or strpos(lower(o.sales_order_no),lower(p_order_number))>0)
 ), page as (select * from matches order by created_at desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100))
 select jsonb_build_object('total',(select count(*) from matches),'items',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]'::jsonb) from page));
$$;
revoke all on function public.search_order_documents_v2(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_order_documents_v2(uuid,text,text,integer,integer) to service_role;

commit;
