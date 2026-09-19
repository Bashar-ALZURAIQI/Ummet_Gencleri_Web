-- Publishing a non-event CMS target still updates published_site_content.content.
-- The original combined trigger therefore re-synchronized every event activity
-- for committee/about/gallery/etc. edits. That can reject an otherwise valid
-- own-committee publication when the acting executive does not own an existing
-- activity. Split INSERT and UPDATE triggers so UPDATE synchronization runs only
-- when the events value itself changed.

DROP TRIGGER IF EXISTS sync_published_event_activities_trigger
  ON public.published_site_content;
DROP TRIGGER IF EXISTS sync_published_event_activities_insert_trigger
  ON public.published_site_content;
DROP TRIGGER IF EXISTS sync_published_event_activities_update_trigger
  ON public.published_site_content;

CREATE TRIGGER sync_published_event_activities_insert_trigger
AFTER INSERT ON public.published_site_content
FOR EACH ROW
WHEN (NEW.id = 'main')
EXECUTE FUNCTION public.sync_published_event_activities();

CREATE TRIGGER sync_published_event_activities_update_trigger
AFTER UPDATE OF content ON public.published_site_content
FOR EACH ROW
WHEN (
  NEW.id = 'main'
  AND OLD.content -> 'events' IS DISTINCT FROM NEW.content -> 'events'
)
EXECUTE FUNCTION public.sync_published_event_activities();
