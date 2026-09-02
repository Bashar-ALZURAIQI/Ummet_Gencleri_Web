Deno.serve(() => {
  return new Response(JSON.stringify({
    error: "setup-board-accounts is disabled; account creation and role assignment use reviewed migrations and president-only RPCs.",
  }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
});
