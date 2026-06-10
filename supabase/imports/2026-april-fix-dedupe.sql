-- ============================================================
-- OPRAVA: duplicitní dubnové dorovnání + cesťák
-- Vznikla protože hlavní import skript se omylem spustil 2×.
-- Tenhle skript je idempotentní — bezpečné spustit kolikrát chceš.
-- ============================================================

begin;

-- 1. Smaž všechny dorovnávací var_costs řádky pro duben
--    (markované task_name = 'Dorovnání mzdy - duben' nebo 'Mzda duben')
delete from variable_costs
where month = '4,2026'
  and date = '2026-04-30'
  and task_name in ('Dorovnání mzdy - duben', 'Mzda duben');

-- 2. Smaž cesťák z extra_costs
delete from extra_costs
where month = '4,2026'
  and name = 'Cestovní náhrady';

-- 3. Vlož dorovnání PŘESNĚ JEDNOU
insert into variable_costs (team_member, client, hours, price, task_type, date, task_name, month) values
('Ondřej Cetkovský', NULL, NULL,  2098.50, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Ondřej Kolář',     NULL, NULL,  3417.30, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Anna Švaralová',   NULL, NULL, 12750.00, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Jan Pachota',      NULL, NULL, 18475.00, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Daniel Richtr',    NULL, NULL,  -543.00, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Adam Onderka',     NULL, NULL, 10500.00, NULL,        '2026-04-30', 'Mzda duben',             '4,2026');

-- 4. Vlož cesťák PŘESNĚ JEDNOU
insert into extra_costs (name, amount, month, date) values
('Cestovní náhrady', 6567.40, '4,2026', '2026-04-30');

-- 5. Verifikace — duben by měl ukazovat:
--    variable_costs: 79 řádků, 120 369 Kč
--    extra_costs:    14 řádků,  26 799 Kč
select 'variable_costs 4,2026' as co, count(*)::int as zaznamu, round(sum(price)::numeric, 2) as kc
  from variable_costs where month = '4,2026'
union all
select 'extra_costs 4,2026', count(*)::int, round(sum(amount)::numeric, 2)
  from extra_costs where month = '4,2026';

commit;
