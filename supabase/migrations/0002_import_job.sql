-- A new kind of job: read the menu from the restaurant's own website. The owner asks for it from the web app
-- ("Import my menu from my website"); input = { url }. The worker reads the page and writes the dishes.
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in ('reel', 'remusic', 'storyboard', 'import'));
