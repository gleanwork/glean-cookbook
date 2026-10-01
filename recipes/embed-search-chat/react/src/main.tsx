import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  renderChat,
  renderSearchBox,
  renderSearchResults,
  type AuthTokenDetails,
} from '@gleanwork/web-sdk';
import { fetchGleanToken } from './auth';
import './styles.css';

type AuthMode = 'sso' | 'token';

type Config = {
  backend: string;
  webAppUrl: string;
  authMode: AuthMode;
  initialQuery?: string;
  initialMessage?: string;
};

type WidgetAuth =
  | { authMethod: 'sso' }
  | {
      authMethod: 'token';
      authToken: AuthTokenDetails;
      onAuthTokenRequired: () => Promise<AuthTokenDetails>;
    };

function readOrigin(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Set ${label} in .env.local, then restart the dev server.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${label} must be an HTTPS origin with no path, query, or credentials.`,
    );
  }
  if (
    label === 'VITE_GLEAN_WEB_APP_URL' &&
    /(^|-)be\.glean\.com$/u.test(url.hostname)
  ) {
    throw new Error(
      `${label} must be the Glean Web app URL, not the backend URL. Find it in Admin > About Glean.`,
    );
  }
  return url.origin;
}

function loadConfig(): Config {
  const configuredAuthMode =
    import.meta.env.VITE_GLEAN_AUTH_MODE?.trim() || 'sso';
  if (configuredAuthMode !== 'sso' && configuredAuthMode !== 'token') {
    throw new Error('VITE_GLEAN_AUTH_MODE must be either sso or token.');
  }

  return {
    backend: readOrigin(
      import.meta.env.VITE_GLEAN_BACKEND,
      'VITE_GLEAN_BACKEND',
    ),
    webAppUrl: readOrigin(
      import.meta.env.VITE_GLEAN_WEB_APP_URL,
      'VITE_GLEAN_WEB_APP_URL',
    ),
    authMode: configuredAuthMode,
    initialQuery: import.meta.env.VITE_GLEAN_INITIAL_QUERY?.trim() || undefined,
    initialMessage:
      import.meta.env.VITE_GLEAN_INITIAL_MESSAGE?.trim() || undefined,
  };
}

function ErrorState({ message }: { message: string }): ReactElement {
  return (
    <main className="shell">
      <section className="error-card" role="alert">
        <h1>Glean configuration needed</h1>
        <p>{message}</p>
        <p>
          Configure the selected auth mode, copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, then restart Vite.
        </p>
      </section>
    </main>
  );
}

function LoadingState(): ReactElement {
  return (
    <main className="shell">
      <section className="error-card" aria-live="polite">
        <h1>Connecting to Glean</h1>
        <p>Requesting a short-lived user-scoped token from the host app.</p>
      </section>
    </main>
  );
}

function WidgetOptions(config: Config, auth: WidgetAuth) {
  return {
    backend: config.backend,
    webAppUrl: config.webAppUrl,
    enable3PCookieAccessRequest: auth.authMethod === 'sso',
    ...auth,
  };
}

function SearchPanel({
  config,
  auth,
}: {
  config: Config;
  auth: WidgetAuth;
}): ReactElement {
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(config.initialQuery ?? '');
  const handleSearch = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  useEffect(() => {
    const element = searchBoxRef.current;
    if (!element) return;

    element.replaceChildren();
    renderSearchBox(element, {
      ...WidgetOptions(config, auth),
      query: config.initialQuery,
      onSearch: handleSearch,
    });

    return () => element.replaceChildren();
  }, [auth, config, handleSearch]);

  useEffect(() => {
    const element = searchResultsRef.current;
    if (!element) return;

    element.replaceChildren();
    renderSearchResults(element, {
      ...WidgetOptions(config, auth),
      query,
      onSearch: handleSearch,
    });

    return () => element.replaceChildren();
  }, [auth, config, handleSearch, query]);

  return (
    <section className="card search-card" aria-labelledby="search-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Permission-aware discovery</p>
          <h2 id="search-heading">Search company knowledge</h2>
        </div>
        <span className="auth-badge">
          {config.authMode === 'sso' ? 'SSO' : 'SERVER TOKEN'}
        </span>
      </div>
      <div className="search-box-container" ref={searchBoxRef} />
      <div className="search-results-container" ref={searchResultsRef} />
    </section>
  );
}

function ChatPanel({
  config,
  auth,
}: {
  config: Config;
  auth: WidgetAuth;
}): ReactElement {
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chatRef.current;
    if (!element) return;

    element.replaceChildren();
    renderChat(element, {
      ...WidgetOptions(config, auth),
      ...(config.initialMessage
        ? { initialMessage: config.initialMessage }
        : {}),
    });

    return () => element.replaceChildren();
  }, [auth, config]);

  return (
    <section className="card chat-card" aria-labelledby="chat-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Answers where work happens</p>
          <h2 id="chat-heading">Ask Glean</h2>
        </div>
        <span className="auth-badge">
          {config.authMode === 'sso' ? 'SSO' : 'SERVER TOKEN'}
        </span>
      </div>
      <div className="chat-container" ref={chatRef} />
    </section>
  );
}

function AuthenticatedApp({
  config,
  auth,
}: {
  config: Config;
  auth: WidgetAuth;
}): ReactElement {
  return (
    <>
      <header className="site-header">
        <div>
          <p className="eyebrow">Glean Web SDK</p>
          <h1>Search and chat inside your app</h1>
        </div>
        <p className="header-note">
          {config.authMode === 'sso'
            ? 'The widgets use the signed-in Glean session, so results stay scoped to the current user.'
            : 'The host app supplies a short-lived user token, so results stay scoped to the current user without iframe SSO cookies.'}
        </p>
      </header>
      <main className="layout">
        <SearchPanel config={config} auth={auth} />
        <ChatPanel config={config} auth={auth} />
      </main>
    </>
  );
}

function App({ config }: { config: Config }): ReactElement {
  const [authToken, setAuthToken] = useState<AuthTokenDetails>();
  const [authError, setAuthError] = useState<string>();
  const refreshAuthToken = useCallback(() => fetchGleanToken(), []);

  useEffect(() => {
    if (config.authMode !== 'token') return;

    fetchGleanToken()
      .then(setAuthToken)
      .catch((error: unknown) => {
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Unable to obtain a Glean token.',
        );
      });
  }, [config.authMode]);

  if (authError) return <ErrorState message={authError} />;
  if (config.authMode === 'sso') {
    return <AuthenticatedApp config={config} auth={{ authMethod: 'sso' }} />;
  }
  if (!authToken) return <LoadingState />;
  return (
    <AuthenticatedApp
      config={config}
      auth={{
        authMethod: 'token',
        authToken,
        onAuthTokenRequired: refreshAuthToken,
      }}
    />
  );
}

function Root(): ReactElement {
  try {
    return <App config={loadConfig()} />;
  } catch (error) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : 'Invalid Glean configuration.'
        }
      />
    );
  }
}

createRoot(document.getElementById('root')!).render(<Root />);
