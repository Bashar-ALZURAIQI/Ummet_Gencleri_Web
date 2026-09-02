export interface IsolatedAuthClientOptions {
  auth: {
    persistSession: false;
    autoRefreshToken: false;
    detectSessionInUrl: false;
  };
}

export function createIsolatedAuthClient<TClient>(
  createClient: (url: string, key: string, options: IsolatedAuthClientOptions) => TClient,
  url: string,
  key: string,
): TClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
