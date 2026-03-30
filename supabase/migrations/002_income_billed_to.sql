alter table income add column if not exists billed_to text check (billed_to in ('Martin', 'Honza', 'Sportivea'));
