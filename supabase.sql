-- RESPALDO DE LA BASE DE DATOS (Supabase) - INSTALADAS JM
-- Solo estructura y funciones. No contiene datos ni claves.

-- ================= TABLAS (referencia) =================
-- admin_rules: month text, cargo text, weekly jsonb, monthly jsonb, comm numeric, eff jsonb
-- advisors: id uuid, name text, code text (12 caracteres al azar), profile text, custom_tiers (lista), active boolean, cargo text
-- attendance: day date, advisor_id uuid, st text, note text
-- attendance_closed: month text, at timestamptz, by_email text
-- attendance_log: id bigint, at timestamptz, by_email text, day date, advisor_id uuid, old_st text, new_st text
-- audit_log: id bigint, at timestamptz, by_email text, tabla text, accion text, detalle jsonb
-- bonus_overrides: week_start date, advisor_id uuid, amount integer, note text
-- bonus_rules: month text, profile text, levels jsonb
-- closes: month text, data jsonb, closed_at timestamptz
-- eff: id integer, month text, rows jsonb, at timestamptz
-- installs: month text, advisor_id uuid, n integer, updated_at timestamptz
-- messages: id integer, body text, updated_at timestamptz
-- profiles: month text, name text, tiers (lista)
-- push_subs: endpoint text, advisor_id uuid, sub jsonb, created_at timestamptz
-- reports: day date, advisor_id uuid, n integer
-- sales: id bigint, month text, advisor_id uuid, day date, client text, kind text, slot text
-- settings: month text, team_tiers (lista de enteros)
-- staff: email text, role text
-- staff_push: endpoint text, email text, sub jsonb
-- sync_status: id integer, at timestamptz, sales integer, unknown (lista), mismatch (lista), alerted timestamptz
-- ventas: id bigint, month text, advisor_id uuid, doc text, plan text, precio numeric, distrito text, recibo numeric
-- Todas las tablas tienen RLS (seguridad por filas) activada.

-- ================= FUNCIONES =================

CREATE OR REPLACE FUNCTION public.advisor_att(p_code text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce(json_object_agg(st,c),'{}'::json) from (
  select t.st, count(*) c from attendance t join advisors a on a.id=t.advisor_id
  where a.code=lower(trim(p_code)) and a.active and to_char(t.day,'YYYY-MM')=to_char(now() at time zone 'America/Lima','YYYY-MM')
  group by t.st) x $function$;

CREATE OR REPLACE FUNCTION public.advisor_cargo(p_code text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select cargo from advisors where code=lower(trim(p_code)) and active $function$;

CREATE OR REPLACE FUNCTION public.advisor_view(p_code text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with m as (select to_char(now() at time zone 'America/Lima','YYYY-MM') mo, date_trunc('week', now() at time zone 'America/Lima')::date ws, (now() at time zone 'America/Lima')::date today)
 select json_build_object('name',a.name,'month',m.mo,'n',coalesce(i.n,0),'updated',i.updated_at,
  'tiers',coalesce(a.custom_tiers,(select p.tiers from profiles p where p.name=a.profile and p.month<=m.mo order by p.month desc limit 1),'{}'),
  'msg',(select body from messages where id=1),
  'today',day_n(a.id,m.today),
  'sales',(select coalesce(json_agg(json_build_object('d',s.day,'c',s.client,'s',s.slot) order by s.day desc, s.id desc),'[]'::json) from sales s where s.advisor_id=a.id and s.month=m.mo and s.kind='inst'),
  'prog',(select coalesce(json_agg(json_build_object('d',s.day,'c',s.client,'t',s.slot) order by s.day asc, s.id),'[]'::json) from sales s where s.advisor_id=a.id and s.month=m.mo and s.kind='prog'),
  'canc',(select coalesce(json_agg(json_build_object('d',s.day,'c',s.client,'t',s.slot) order by s.day desc, s.id desc),'[]'::json) from sales s where s.advisor_id=a.id and s.month=m.mo and s.kind='canc'),
  'week',json_build_object('start',m.ws,'n',week_n(a.id,m.ws),
    'levels',coalesce(rl(a.profile,to_char(m.ws,'YYYY-MM')),rl(a.profile,to_char(m.ws+7,'YYYY-MM'))),
    'override',(select o.amount from bonus_overrides o where o.advisor_id=a.id and o.week_start=m.ws),
    'last_n',week_n(a.id,m.ws-7),
    'last_levels',rl(a.profile,to_char(m.ws-7,'YYYY-MM')),
    'last_override',(select o.amount from bonus_overrides o where o.advisor_id=a.id and o.week_start=m.ws-7)))
 from advisors a cross join m left join installs i on i.advisor_id=a.id and i.month=m.mo
 where a.code=lower(trim(p_code)) and a.active $function$;

CREATE OR REPLACE FUNCTION public.save_push(p_code text, p_sub jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid;
begin
 select id into v from advisors where code=lower(trim(p_code)) and active;
 if v is null then return false; end if;
 insert into push_subs(endpoint,advisor_id,sub) values (p_sub->>'endpoint',v,p_sub)
 on conflict (endpoint) do update set advisor_id=excluded.advisor_id, sub=excluded.sub;
 return true;
end $function$;

-- staff_view: versión corregida (solo responde a cargos que no son ASESOR)
CREATE OR REPLACE FUNCTION public.staff_view(p_code text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with m as (select to_char(now() at time zone 'America/Lima','YYYY-MM') mo, date_trunc('week', now() at time zone 'America/Lima')::date ws),
 a as (select cargo from advisors where code=lower(trim(p_code)) and active and coalesce(cargo,'ASESOR')<>'ASESOR')
 select json_build_object('cargo',a.cargo,
  'team_week',(select coalesce(sum(week_n(x.id,m.ws)),0) from advisors x where x.active and x.cargo='ASESOR'),
  'team_month',(select coalesce(sum(i.n),0) from installs i join advisors x on x.id=i.advisor_id where i.month=m.mo and x.active and x.cargo='ASESOR'),
  'tiers',(select s.team_tiers from settings s where s.month<=m.mo order by s.month desc limit 1),
  'rules',(select row_to_json(r) from admin_rules r where r.cargo=a.cargo and r.month<=m.mo order by r.month desc limit 1),
  'week_rules',coalesce((select r.weekly from admin_rules r where r.cargo=a.cargo and r.month<=to_char(m.ws,'YYYY-MM') order by r.month desc limit 1),(select r.weekly from admin_rules r where r.cargo=a.cargo and r.month<=to_char(m.ws+7,'YYYY-MM') order by r.month desc limit 1)),
  'eff',(select rows from eff where id=1))
 from a cross join m $function$;

CREATE OR REPLACE FUNCTION public.ventas_view(p_code text)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with a as (select id, cargo from advisors where code=lower(trim(p_code)) and active),
 m as (select to_char(now() at time zone 'America/Lima','YYYY-MM') mo)
 select coalesce(json_agg(json_build_object('a',x.name,'doc',case when a.cargo='ASESOR' then null else v.doc end,'p',v.plan,'pr',v.precio,'d',v.distrito,'r',v.recibo) order by v.distrito, x.name),'[]'::json)
 from ventas v join advisors x on x.id=v.advisor_id cross join a cross join m
 where v.month=m.mo and (a.cargo in ('BACK OFFICE','SUPERVISOR','JEFE') or v.advisor_id=a.id) $function$;

-- Faltan por guardar: day_n, week_n, rl, me_role, att_trg, audit_trg, las políticas RLS y los triggers.

-- ================= FUNCIONES DE APOYO =================
-- (La nota de arriba "Faltan por guardar" ya solo aplica a las políticas RLS y los triggers)

CREATE OR REPLACE FUNCTION public.att_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date; a uuid;
begin
 d := coalesce(new.day, old.day); a := coalesce(new.advisor_id, old.advisor_id);
 if exists(select 1 from attendance_closed where month=to_char(d,'YYYY-MM')) and coalesce(me_role(),'')<>'sup' then
  raise exception 'Mes cerrado';
 end if;
 if tg_op='UPDATE' and old.st=new.st then return new; end if;
 insert into attendance_log(by_email,day,advisor_id,old_st,new_st)
  values (lower(auth.jwt()->>'email'), d, a, case when tg_op='INSERT' then null else old.st end, case when tg_op='DELETE' then null else new.st end);
 return coalesce(new, old);
end $function$;

CREATE OR REPLACE FUNCTION public.audit_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into audit_log(by_email,tabla,accion,detalle)
 values (lower(coalesce(auth.jwt()->>'email','')), tg_table_name, tg_op, case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
 return coalesce(new, old);
end $function$;

CREATE OR REPLACE FUNCTION public.day_n(p_adv uuid, p_day date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select case when t.n is null then 0 else greatest(t.n - coalesce(p.n, case when t.day=(select min(day) from reports where advisor_id=p_adv) then t.n else 0 end),0) end
 from (select 1) x
 left join (select day,n from reports where advisor_id=p_adv and day=p_day) t on true
 left join lateral (select r.n from reports r where r.advisor_id=p_adv and r.day<p_day and date_trunc('month',r.day)=date_trunc('month',p_day) order by r.day desc limit 1) p on true $function$;

CREATE OR REPLACE FUNCTION public.me_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select role from public.staff where email=lower(auth.jwt()->>'email') $function$;

CREATE OR REPLACE FUNCTION public.rl(pf text, mo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
 select levels from bonus_rules where profile=pf and month<=mo order by month desc limit 1 $function$;

CREATE OR REPLACE FUNCTION public.week_n(p_adv uuid, p_start date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce(sum(inc),0)::int from (
  select day, n - coalesce(lag(n) over (partition by date_trunc('month',day) order by day),
     case when day=(select min(r2.day) from reports r2 where r2.advisor_id=p_adv) then n else 0 end) as inc
  from reports where advisor_id=p_adv and day >= date_trunc('month',p_start)::date and day <= p_start+6
 ) t where day between p_start and p_start+6 $function$;