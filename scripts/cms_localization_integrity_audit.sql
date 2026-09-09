-- READ-ONLY CMS localization integrity audit.
-- Safe to run in the Supabase SQL editor: every statement is SELECT-only.

-- 1. Canonical target inventory from the three canonical stores.
WITH canonical AS (
  SELECT CASE key
           WHEN 'siteContent' THEN 'site'
           WHEN 'aboutContent' THEN 'about'
           ELSE key
         END AS target,
         value AS payload
  FROM public.published_site_content,
       LATERAL jsonb_each(content)
  WHERE id = 'main'
  UNION ALL
  SELECT 'guideSections', sections FROM public.student_guide WHERE id = 'main'
  UNION ALL
  SELECT 'guideQuickInfo', to_jsonb(quick_info) FROM public.student_guide WHERE id = 'main'
  UNION ALL
  SELECT 'faqCategories', categories FROM public.faq WHERE id = 'main'
)
SELECT c.target,
       jsonb_typeof(c.payload) AS canonical_type,
       CASE WHEN jsonb_typeof(c.payload) = 'array' THEN jsonb_array_length(c.payload) END AS canonical_count,
       l.locale,
       l.partition,
       jsonb_typeof(l.payload) AS localized_type,
       CASE WHEN jsonb_typeof(l.payload) = 'array' THEN jsonb_array_length(l.payload) END AS localized_count,
       l.updated_at
FROM canonical c
LEFT JOIN public.cms_localizations l ON l.target = c.target
ORDER BY c.target, l.locale, l.partition;

-- 2. Find any object made entirely of numeric keys (the known array-corruption signature), at any depth.
WITH RECURSIVE nodes AS (
  SELECT target, locale, partition, '$'::text AS json_path, payload AS node
  FROM public.cms_localizations
  UNION ALL
  SELECT n.target, n.locale, n.partition, n.json_path || child.path_part, child.node
  FROM nodes n
  CROSS JOIN LATERAL (
    SELECT '.' || e.key AS path_part, e.value AS node
    FROM jsonb_each(CASE WHEN jsonb_typeof(n.node) = 'object' THEN n.node ELSE '{}'::jsonb END) e
    UNION ALL
    SELECT '[' || (a.ordinality - 1)::text || ']', a.value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.node) = 'array' THEN n.node ELSE '[]'::jsonb END)
         WITH ORDINALITY a(value, ordinality)
  ) child
)
SELECT target, locale, partition, json_path, node
FROM nodes
WHERE jsonb_typeof(node) = 'object'
  AND jsonb_object_length(node) > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(node) key_name
    WHERE key_name !~ '^[0-9]+$'
  )
ORDER BY target, locale, partition, json_path;

-- 3. Stable-ID inventory. Missing canonical IDs identify partial localization payloads;
-- orphan localized IDs identify deleted/mismatched entities. This walks nested arrays too.
WITH RECURSIVE canonical_roots AS (
  SELECT CASE key WHEN 'siteContent' THEN 'site' WHEN 'aboutContent' THEN 'about' ELSE key END AS target,
         value AS payload
  FROM public.published_site_content, LATERAL jsonb_each(content)
  WHERE id = 'main'
  UNION ALL SELECT 'guideSections', sections FROM public.student_guide WHERE id = 'main'
  UNION ALL SELECT 'faqCategories', categories FROM public.faq WHERE id = 'main'
),
canonical_nodes AS (
  SELECT target, payload AS node FROM canonical_roots
  UNION ALL
  SELECT n.target, child.node
  FROM canonical_nodes n
  CROSS JOIN LATERAL (
    SELECT value AS node FROM jsonb_each(CASE WHEN jsonb_typeof(n.node) = 'object' THEN n.node ELSE '{}'::jsonb END)
    UNION ALL
    SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.node) = 'array' THEN n.node ELSE '[]'::jsonb END)
  ) child
),
localized_nodes AS (
  SELECT target, locale, partition, payload AS node FROM public.cms_localizations
  UNION ALL
  SELECT n.target, n.locale, n.partition, child.node
  FROM localized_nodes n
  CROSS JOIN LATERAL (
    SELECT value AS node FROM jsonb_each(CASE WHEN jsonb_typeof(n.node) = 'object' THEN n.node ELSE '{}'::jsonb END)
    UNION ALL
    SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.node) = 'array' THEN n.node ELSE '[]'::jsonb END)
  ) child
),
canonical_ids AS (
  SELECT DISTINCT target, node ->> 'id' AS entity_id
  FROM canonical_nodes
  WHERE jsonb_typeof(node) = 'object' AND NULLIF(node ->> 'id', '') IS NOT NULL
),
localized_ids AS (
  SELECT DISTINCT target, locale, partition, node ->> 'id' AS entity_id
  FROM localized_nodes
  WHERE jsonb_typeof(node) = 'object' AND NULLIF(node ->> 'id', '') IS NOT NULL
),
partitions AS (
  SELECT DISTINCT target, locale, partition FROM public.cms_localizations
)
SELECT p.target, p.locale, p.partition, 'missing_localized_id' AS issue, c.entity_id
FROM partitions p
JOIN canonical_ids c USING (target)
LEFT JOIN localized_ids l
  ON l.target = p.target AND l.locale = p.locale AND l.partition = p.partition AND l.entity_id = c.entity_id
WHERE l.entity_id IS NULL
UNION ALL
SELECT l.target, l.locale, l.partition, 'orphan_localized_id', l.entity_id
FROM localized_ids l
LEFT JOIN canonical_ids c ON c.target = l.target AND c.entity_id = l.entity_id
WHERE c.entity_id IS NULL
ORDER BY target, locale, partition, issue, entity_id;

-- 4. Draft/published mismatch summary and pending manual-path inventory.
SELECT COALESCE(d.target, p.target) AS target,
       COALESCE(d.locale, p.locale) AS locale,
       p.updated_at AS published_at,
       d.updated_at AS draft_at,
       COALESCE(array_length(p.manual_paths, 1), 0) AS published_manual_path_count,
       COALESCE(array_length(d.manual_paths, 1), 0) AS draft_manual_path_count,
       d.manual_paths AS pending_draft_paths,
       jsonb_typeof(p.payload) AS published_type,
       jsonb_typeof(d.payload) AS draft_type
FROM public.cms_localizations p
FULL JOIN public.cms_localizations d
  ON d.target = p.target AND d.locale = p.locale AND d.partition = 'draft'
WHERE p.partition = 'published' OR p.partition IS NULL
ORDER BY target, locale;
