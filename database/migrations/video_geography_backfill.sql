-- video_geography_backfill.sql
-- -----------------------------------------------------------------------------
-- Purpose: Draft SQL statements to backfill the new division_id and zone_id
--          columns introduced for video archiving entities.
--
-- NOTE: This script is intentionally NOT idempotent. Review carefully, adjust
--       the temporary mapping sections, and execute manually in a controlled
--       environment. Do NOT run blindly in production.
-- -----------------------------------------------------------------------------

BEGIN;

-- ========================================================================= --
-- 1. Helper mappings
-- ========================================================================= --

-- 1.a. Ensure every town has an explicit zone reference via efiling_zone_locations.
--      If your data already covers all towns, this sanity check will simply
--      report missing entries. Populate the mapping table before proceeding.
WITH missing_town_zones AS (
    SELECT t.id AS town_id,
           t.town,
           d.id AS district_id,
           d.title AS district_name
    FROM town t
    LEFT JOIN efiling_zone_locations ezl ON ezl.town_id = t.id
    LEFT JOIN district d ON d.id = t.district_id
    WHERE ezl.id IS NULL
)
SELECT *
FROM missing_town_zones;

-- 1.b. Create a temporary mapping table for town → division
--      Populate this table with authoritative mappings BEFORE running the
--      UPDATE statements below. You can derive the expected values from
--      divisional org charts or the new bridge tables (e.g. efiling_department_locations).
DROP TABLE IF EXISTS tmp_video_division_map;
CREATE TEMP TABLE tmp_video_division_map (
    district_id INT,
    town_id     INT,
    division_id INT,
    zone_id     INT NULL,
    comment     TEXT NULL
);

-- INSERT INTO tmp_video_division_map (district_id, town_id, division_id, zone_id, comment)
-- VALUES
--     (-- TODO: district_id, town_id, division_id, zone_id (optional), 'Source / rationale');
--
-- Repeat as many INSERT rows as required to cover every town/division pairing.

-- Optional: seed division lookups directly from divisions table for sanity.
SELECT id AS division_id, name, code, ce_type
FROM divisions
ORDER BY ce_type, name;

-- ========================================================================= --
-- 2. Backfill work_requests
-- ========================================================================= --

-- 2.a. Update zone_id from town-level mapping.
UPDATE work_requests wr
SET zone_id = ezl.zone_id
FROM efiling_zone_locations ezl
WHERE wr.zone_id IS NULL
  AND ezl.town_id = wr.town_id;

-- Fallback: use district-level zone when town-level entry is absent.
UPDATE work_requests wr
SET zone_id = ezl.zone_id
FROM efiling_zone_locations ezl
WHERE wr.zone_id IS NULL
  AND ezl.district_id IS NOT NULL
  AND ezl.district_id = wr.district_id;

-- 2.b. Update division_id using the temporary mapping table.
UPDATE work_requests wr
SET division_id = COALESCE(map.division_id, wr.division_id)
FROM tmp_video_division_map map
WHERE map.town_id = wr.town_id;

-- Optional: fall back to district-level mapping when town_id is NULL.
UPDATE work_requests wr
SET division_id = COALESCE(map.division_id, wr.division_id)
FROM tmp_video_division_map map
WHERE wr.town_id IS NULL
  AND map.district_id = wr.district_id
  AND map.town_id IS NULL;

-- ========================================================================= --
-- 3. Backfill before_content / images / videos / final_videos
-- ========================================================================= --

-- 3.a. before_content
UPDATE before_content bc
SET zone_id = COALESCE(bc.zone_id, wr.zone_id),
    division_id = COALESCE(bc.division_id, wr.division_id)
FROM work_requests wr
WHERE bc.work_request_id = wr.id
  AND (bc.zone_id IS DISTINCT FROM wr.zone_id OR bc.division_id IS DISTINCT FROM wr.division_id);

-- 3.b. images
UPDATE images img
SET zone_id = COALESCE(img.zone_id, wr.zone_id),
    division_id = COALESCE(img.division_id, wr.division_id)
FROM work_requests wr
WHERE img.work_request_id = wr.id
  AND (img.zone_id IS DISTINCT FROM wr.zone_id OR img.division_id IS DISTINCT FROM wr.division_id);

-- 3.c. videos
UPDATE videos vid
SET zone_id = COALESCE(vid.zone_id, wr.zone_id),
    division_id = COALESCE(vid.division_id, wr.division_id)
FROM work_requests wr
WHERE vid.work_request_id = wr.id
  AND (vid.zone_id IS DISTINCT FROM wr.zone_id OR vid.division_id IS DISTINCT FROM wr.division_id);

-- 3.d. final_videos
UPDATE final_videos fv
SET zone_id = COALESCE(fv.zone_id, wr.zone_id),
    division_id = COALESCE(fv.division_id, wr.division_id)
FROM work_requests wr
WHERE fv.work_request_id = wr.id
  AND (fv.zone_id IS DISTINCT FROM wr.zone_id OR fv.division_id IS DISTINCT FROM wr.division_id);

-- ========================================================================= --
-- 4. Validation queries
-- ========================================================================= --

-- Count remaining NULL geography values per table.
SELECT 'work_requests' AS table_name,
       COUNT(*) FILTER (WHERE zone_id IS NULL) AS null_zone,
       COUNT(*) FILTER (WHERE division_id IS NULL) AS null_division
FROM work_requests
UNION ALL
SELECT 'before_content',
       COUNT(*) FILTER (WHERE zone_id IS NULL),
       COUNT(*) FILTER (WHERE division_id IS NULL)
FROM before_content
UNION ALL
SELECT 'images',
       COUNT(*) FILTER (WHERE zone_id IS NULL),
       COUNT(*) FILTER (WHERE division_id IS NULL)
FROM images
UNION ALL
SELECT 'videos',
       COUNT(*) FILTER (WHERE zone_id IS NULL),
       COUNT(*) FILTER (WHERE division_id IS NULL)
FROM videos
UNION ALL
SELECT 'final_videos',
       COUNT(*) FILTER (WHERE zone_id IS NULL),
       COUNT(*) FILTER (WHERE division_id IS NULL)
FROM final_videos;

-- Review a sample to ensure the propagation succeeded.
SELECT wr.id,
       wr.zone_id,
       wr.division_id,
       vz.name  AS zone_name,
       dv.name  AS division_name,
       wr.town_id,
       t.town   AS town_name
FROM work_requests wr
LEFT JOIN efiling_zones vz ON vz.id = wr.zone_id
LEFT JOIN divisions dv ON dv.id = wr.division_id
LEFT JOIN town t ON t.id = wr.town_id
ORDER BY wr.updated_date DESC
LIMIT 50;

ROLLBACK; -- Replace with COMMIT once you verify the results in a lower environment.
