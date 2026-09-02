-- Ensure authenticated executives can call the president-guarded rejection RPC.
REVOKE EXECUTE ON FUNCTION public.reject_profile_edit_request(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reject_profile_edit_request(uuid, text)
  TO authenticated;
