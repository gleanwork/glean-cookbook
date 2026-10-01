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
} from '@gleanwork/web-sdk';
import './styles.css';

type Config = {
  backend: string;
  webAppUrl: string;
  initialQuery?: string;
  initialMessage?: string;
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
  return {
    backend: readOrigin(
      import.meta.env.VITE_GLEAN_BACKEND,
      'VITE_GLEAN_BACKEND',
    ),
    webAppUrl: readOrigin(
      import.meta.env.VITE_GLEAN_WEB_APP_URL,
      'VITE_GLEAN_WEB_APP_URL',
    ),
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
          Configure the backend and Web app URL, copy <code>.env.example</code>{' '}
          to <code>.env.local</code>, then restart Vite.
        </p>
      </section>
    </main>
  );
}

function WidgetOptions(config: Config) {
  return {
    backend: config.backend,
    webAppUrl: config.webAppUrl,
    authMethod: 'sso' as const,
    enable3PCookieAccessRequest: true,
  };
}

function SearchPanel({ config }: { config: Config }): ReactElement {
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
      ...WidgetOptions(config),
      query: config.initialQuery,
      onSearch: handleSearch,
    });

    return () => element.replaceChildren();
  }, [config, handleSearch]);

  useEffect(() => {
    const element = searchResultsRef.current;
    if (!element) return;

    element.replaceChildren();
    renderSearchResults(element, {
      ...WidgetOptions(config),
      query,
      onSearch: handleSearch,
    });

    return () => element.replaceChildren();
  }, [config, handleSearch, query]);

  return (
    <section className="card search-card" aria-labelledby="search-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Permission-aware discovery</p>
          <h2 id="search-heading">Search company knowledge</h2>
        </div>
        <span className="auth-badge">SSO</span>
      </div>
      <div className="search-box-container" ref={searchBoxRef} />
      <div className="search-results-container" ref={searchResultsRef} />
    </section>
  );
}

function ChatPanel({ config }: { config: Config }): ReactElement {
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chatRef.current;
    if (!element) return;

    element.replaceChildren();
    renderChat(element, {
      ...WidgetOptions(config),
      ...(config.initialMessage
        ? { initialMessage: config.initialMessage }
        : {}),
    });

    return () => element.replaceChildren();
  }, [config]);

  return (
    <section className="card chat-card" aria-labelledby="chat-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Answers where work happens</p>
          <h2 id="chat-heading">Ask Glean</h2>
        </div>
        <span className="auth-badge">SSO</span>
      </div>
      <div className="chat-container" ref={chatRef} />
    </section>
  );
}

function App({ config }: { config: Config }): ReactElement {
  return (
    <>
      <header className="site-header">
        <div>
          <p className="eyebrow">Glean Web SDK</p>
          <h1>Search and chat inside your app</h1>
        </div>
        <p className="header-note">
          The widgets use the signed-in Glean session, so results stay scoped to
          the current user.
        </p>
      </header>
      <main className="layout">
        <SearchPanel config={config} />
        <ChatPanel config={config} />
      </main>
    </>
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
