ALTER TABLE visitor_registrations
  ADD COLUMN IF NOT EXISTS visit_start_time VARCHAR(5) DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS visit_end_time   VARCHAR(5) DEFAULT '18:00';
