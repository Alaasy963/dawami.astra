// Scope mounted page state to the current membership and permissions.
export function viewContext(
  requested: string,
  allowed: string[],
  identity: {
    owner?: boolean;
    member?: { id: string; company_id: string; role: string };
  },
) {
  const scope = identity.owner
    ? "platform-owner"
    : JSON.stringify([
        identity.member?.company_id,
        identity.member?.id,
        identity.member?.role,
      ]);
  return {
    view: allowed.includes(requested) ? requested : allowed[0],
    scope,
  };
}
