-- ============================================================
-- FINÁLNÍ IMPORT — Příjmy + Dubnové dorovnání + Cesťák
-- Vygenerováno: 2026-06-08T15:52:06.594Z
-- ============================================================

begin;

-- ─── 1. PŘÍJMY — 74 záznamů přes 5 měsíců ───

delete from income where month = '1,2026';
delete from income where month = '2,2026';
delete from income where month = '3,2026';
delete from income where month = '4,2026';
delete from income where month = '5,2026';

insert into income (client, project_name, amount, currency, status, month) values
('Event Group', 'JIZ50', 18000, 'CZK', 'zaplaceno', '1,2026'),
('Tomáš Jurco', 'Jurcík klasické fee', 4200, 'CZK', 'zaplaceno', '1,2026'),
('J&T', 'J&T next gen', 9000, 'CZK', 'zaplaceno', '1,2026'),
('FORTUNA LIGA ŽEN', 'Media Day - Fortuna liga', 105000, 'CZK', 'zaplaceno', '1,2026'),
('More Buckets', 'More Buckets - první natáčení', 25000, 'CZK', 'zaplaceno', '1,2026'),
('Metoděj Jílek', 'Metoděj Jílek', 74000, 'CZK', 'zaplaceno', '1,2026'),
('Slavia Praha', 'SKS - Barcelona', 33000, 'CZK', 'zaplaceno', '1,2026'),
('Flashscore', 'Flash - leden', 37000, 'CZK', 'zaplaceno', '1,2026'),
('Slavia Praha', 'SKS ženy + Diesel', 67000, 'CZK', 'zaplaceno', '1,2026'),
('Kristiina Mäki', 'Natáčení + reels spolupráce', 3200, 'CZK', 'zaplaceno', '2,2026'),
('Metoděj Jílek', 'Metoděj Jílek - event po olympiádě', 5000, 'CZK', 'zaplaceno', '2,2026'),
('VOZP', 'VoZP - první půlka pro Košťála', 20000, 'CZK', 'zaplaceno', '2,2026'),
('Slavia Praha', 'SKS - trend kolotoč + něco?!', 4000, 'CZK', 'zaplaceno', '2,2026'),
('Metoděj Jílek', 'Metoděj točení auto', 6500, 'CZK', 'zaplaceno', '2,2026'),
('Nicole Krutilová', 'Nicole ples', 27000, 'CZK', 'zaplaceno', '2,2026'),
('Event Group', 'RTR 2x video', 29000, 'CZK', 'zaplaceno', '2,2026'),
('More Buckets', 'More Buckets', 30000, 'CZK', 'zaplaceno', '2,2026'),
('J&T', 'J&T banka', 9000, 'CZK', 'zaplaceno', '2,2026'),
('Tomáš Jurco', 'Jurcík feečko', 4200, 'CZK', 'zaplaceno', '2,2026'),
('FORTUNA LIGA ŽEN', 'FL žen videa měsíčně', 22000, 'CZK', 'zaplaceno', '2,2026'),
('Český tenis', 'Davis Cup', 81500, 'CZK', 'zaplaceno', '2,2026'),
('FORTUNA LIGA ŽEN', 'Media Day žen', 110000, 'CZK', 'zaplaceno', '2,2026'),
('Olympijský tým', 'Olympijský festival', 190000, 'CZK', 'zaplaceno', '2,2026'),
('FORTUNA LIGA ŽEN', 'Fortuna liga žen', 45000, 'CZK', 'zaplaceno', '3,2026'),
('STES - FAČR', 'MolCup', 69000, 'CZK', 'zaplaceno', '3,2026'),
('Flashscore', 'Flashscore', 45000, 'CZK', 'zaplaceno', '3,2026'),
('Slavia Praha', 'Slavia - derby', 41850, 'CZK', 'zaplaceno', '3,2026'),
('J&T', 'J&T', 9000, 'CZK', 'zaplaceno', '3,2026'),
('Tomáš Jurco', 'Jurcík', 4200, 'CZK', 'zaplaceno', '3,2026'),
('More Buckets', 'More buckets', 35000, 'CZK', 'zaplaceno', '3,2026'),
('STES - FAČR', 'U21', 23000, 'CZK', 'zaplaceno', '3,2026'),
('KPMG', 'KPMG půl maraton', 15000, 'CZK', 'zaplaceno', '3,2026'),
('Investománie', 'Investománie - finále', 9000, 'CZK', 'zaplaceno', '3,2026'),
('Nikoleta Jíchová', 'Nikoleta Jíchová', 7000, 'CZK', 'zaplaceno', '3,2026'),
('Jonáš Kolomazník', 'Kolomazník - MS Polsko', 7000, 'CZK', 'zaplaceno', '3,2026'),
('STES - FAČR', 'Repre - áčko', 25000, 'CZK', 'zaplaceno', '3,2026'),
('Metoděj Jílek', 'Rychlo natáčení Metoděj', 6000, 'CZK', 'zaplaceno', '3,2026'),
('More Buckets', 'More Buckets - nějaké feečko?', 10000, 'CZK', 'zaplaceno', '4,2026'),
('More Buckets', '3x3 basketbal v Liberci', 12000, 'CZK', 'zaplaceno', '4,2026'),
('Pronatal', 'Spermabanka', 20000, 'CZK', 'zaplaceno', '4,2026'),
('Metoděj Jílek', 'Metoděj Jílek - YT video', 18000, 'CZK', 'zaplaceno', '4,2026'),
('STES - FAČR', 'Mol Cup Junior', 18500, 'CZK', 'zaplaceno', '4,2026'),
('Tomáš Jurco', 'Jurco fee', 4200, 'CZK', 'zaplaceno', '4,2026'),
('J&T', 'J&T next gen', 9000, 'CZK', 'zaplaceno', '4,2026'),
('FORTUNA LIGA ŽEN', 'Fortuna Liga žen', 45000, 'CZK', 'zaplaceno', '4,2026'),
('Slavia Praha', 'SKS - OMV večírek', 12000, 'CZK', 'zaplaceno', '4,2026'),
('KPMG', 'KPMG - Noc rekordů (velvyslanec)', 10000, 'CZK', 'zaplaceno', '4,2026'),
('Mol Cup', 'Mol Cup 2x', 46000, 'CZK', 'zaplaceno', '4,2026'),
('Metoděj Jílek', 'Mety + Tipsport', 15000, 'CZK', 'zaplaceno', '4,2026'),
('Jonáš Kolomazník', 'Jonáš Kolomazník', 3600, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'Oslavy titulu Slavia Praha', 19000, 'CZK', 'zaplaceno', '5,2026'),
('STES - FAČR', 'Česká Lípa x Varnsdorf (předávání pohárů)', 9000, 'CZK', 'zaplaceno', '5,2026'),
('STES - FAČR', 'Rozhodčí den s ní?!', 17000, 'CZK', 'zaplaceno', '5,2026'),
('Metoděj Jílek', 'Metoděj Jílek - MS Youtube', 12000, 'CZK', 'zaplaceno', '5,2026'),
('Pronatal', 'Pronatal dlouhé video', 9500, 'CZK', 'zaplaceno', '5,2026'),
('Český tenis', 'Tiskovka - grafika', 14000, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'Ostatní za duben - květen', 25700, 'CZK', 'zaplaceno', '5,2026'),
('STES - FAČR', 'STES natáčení rozhodčí z duba', 45000, 'CZK', 'zaplaceno', '5,2026'),
('Footzone', 'Antonín Panenka', 10000, 'CZK', 'zaplaceno', '5,2026'),
('Mol Cup', 'Mol Cup - teasing natáčení + 3x reels', 25560, 'CZK', 'zaplaceno', '5,2026'),
('Olympijský tým', 'Olympijský víceboj', 25000, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'Houslistka', 50000, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'slavia x plzeň (dle nákladů)', 12700, 'CZK', 'zaplaceno', '5,2026'),
('Ironman', 'ironman - carousel', 3700, 'CZK', 'zaplaceno', '5,2026'),
('More Buckets', 'More Buckets', 30000, 'CZK', 'zaplaceno', '5,2026'),
('XPS', 'Školení XPS', 16400, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'Fotbalový turnaj Slavia (EDEN partneři)', 18000, 'CZK', 'zaplaceno', '5,2026'),
('Český tenis', 'Davis cup - image reels + tiskovka', 33000, 'CZK', 'zaplaceno', '5,2026'),
('Mol Cup', 'Mol Cup - Finále', 23000, 'CZK', 'zaplaceno', '5,2026'),
('KPMG', 'Noc Rekordů (běh) vč. tiskovky', 20000, 'CZK', 'zaplaceno', '5,2026'),
('Slavia Praha', 'Derby Slavia', 29400, 'CZK', 'zaplaceno', '5,2026'),
('FORTUNA LIGA ŽEN', 'Fortuna liga žen', 75000, 'CZK', 'zaplaceno', '5,2026'),
('Vítek Soukup', 'GYM - Víťa (2x reels + natáčení)', 24000, 'CZK', 'zaplaceno', '5,2026'),
('Beachvolejbal', 'Beachvolejbal - Kylie', 7000, 'CZK', 'zaplaceno', '5,2026');

-- ─── 2. DUBEN — dorovnání variable_costs ───
-- Vyrovnání rozdílu mezi task-level daty a skutečně zaplacenými mzdami

insert into variable_costs (team_member, client, hours, price, task_type, date, task_name, month) values
('Ondřej Cetkovský', NULL, NULL, 2098.5, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Ondřej Kolář', NULL, NULL, 3417.3, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Anna Švaralová', NULL, NULL, 12750, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Jan Pachota', NULL, NULL, 18475, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Daniel Richtr', NULL, NULL, -543, 'Dorovnání', '2026-04-30', 'Dorovnání mzdy - duben', '4,2026'),
('Adam Onderka', NULL, NULL, 10500, NULL, '2026-04-30', 'Mzda duben', '4,2026');

-- ─── 3. DUBEN — cesťák do extra_costs ───

insert into extra_costs (name, amount, month, date) values
('Cestovní náhrady', 6567.4, '4,2026', '2026-04-30');

-- ─── 4. VERIFIKACE ───

select 'income' as tabulka, month, count(*)::int as zaznamu, sum(amount)::int as kc
  from income where month in ('1,2026', '2,2026', '3,2026', '4,2026', '5,2026') group by month
union all
select 'variable_costs', month, count(*)::int, sum(price)::int
  from variable_costs where month in ('1,2026', '2,2026', '3,2026', '4,2026', '5,2026') group by month
union all
select 'extra_costs', month, count(*)::int, sum(amount)::int
  from extra_costs where month in ('1,2026', '2,2026', '3,2026', '4,2026', '5,2026') group by month
order by 1, 2;

commit;
