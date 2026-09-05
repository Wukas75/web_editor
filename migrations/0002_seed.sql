-- Ukážkový web, aby editor po prvom spustení nebol prázdny.

INSERT INTO sites (id, name, slug) VALUES (1, 'Ukážkový web', 'demo');

INSERT INTO site_theme (site_id, theme_vars, custom_css) VALUES (
  1,
  '{"primary":"#1a5f4a","secondary":"#c9a24b","bg":"#ffffff","text":"#1f2320","headerBg":"#ffffff","headerText":"#1f2320","font":"Inter","headingFont":"Poppins","radius":"10","containerWidth":"1180"}',
  ''
);

INSERT INTO pages (site_id, slug, title, is_home, sort, content_json) VALUES (
  1, 'home', 'Domov', 1, 0,
  '[{"type":"hero_slider","id":"b1","intervalMs":6000,"slides":[{"id":"s1","imageUrl":"","heading":"Vitajte na vašom novom webe","subheading":"Poskladajte si stránku z blokov presne podľa seba","buttonText":"Zistiť viac","buttonLink":"#o-nas"},{"id":"s2","imageUrl":"","heading":"Jednoduchý editor priamo na stránke","subheading":"Text, obrázky, fotogaléria aj vlastné CSS","buttonText":"","buttonLink":""}]},{"type":"text","id":"b2","columns":[{"html":"<h2 id=\"o-nas\">O nás</h2><p>Toto je ukážkový textový blok. V režime úprav naň klikni a uprav obsah priamo na stránke.</p>"}]},{"type":"text","id":"b3","columns":[{"html":"<h3>Rýchlosť</h3><p>Statická stránka sa načíta okamžite, bez zbytočného kódu naviac.</p>"},{"html":"<h3>Flexibilita</h3><p>Bloky si poskladáte presne podľa potreby, v ľubovoľnom poradí.</p>"}]},{"type":"gallery","id":"b4","columns":3,"images":[]}]'
);

INSERT INTO pages (site_id, slug, title, is_home, sort, content_json) VALUES (
  1, 'kontakt', 'Kontakt', 0, 1,
  '[{"type":"text","id":"c1","columns":[{"html":"<h2>Kontakt</h2><p>Doplňte kontaktné údaje v režime úprav.</p>"}]}]'
);

INSERT INTO menu_items (site_id, label, link_type, target, sort) VALUES
  (1, 'Domov', 'page', 'home', 0),
  (1, 'Kontakt', 'page', 'kontakt', 1);
