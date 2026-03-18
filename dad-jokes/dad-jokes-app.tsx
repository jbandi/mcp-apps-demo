import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./dad-jokes-app.module.css";

const DAD_JOKE_API = "https://icanhazdadjoke.com";
const USER_AGENT = "MCP Dad Jokes App (https://github.com/mcp-apps-dadjokes)";

interface DadJokeResponse {
  id: string;
  joke: string;
}

interface SearchResponse {
  results: DadJokeResponse[];
}

async function fetchRandomJoke(): Promise<string> {
  const res = await fetch(`${DAD_JOKE_API}/search?limit=30`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error("Failed to fetch joke");
  const data = (await res.json()) as SearchResponse;
  const jokes = data.results ?? [];
  if (jokes.length === 0) {
    const singleRes = await fetch(DAD_JOKE_API, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    const single = (await singleRes.json()) as DadJokeResponse;
    return single.joke;
  }
  const picked = jokes[Math.floor(Math.random() * jokes.length)]!;
  return picked.joke;
}

function DadJokesApp() {
  const [joke, setJoke] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingNew, setFetchingNew] = useState(false);
  const [sent, setSent] = useState(false);

  const { app, error } = useApp({
    appInfo: { name: "Dad Jokes", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.onerror = console.error;
      app.ontoolresult = (result) => {
        if (result.isError) return;
        const textBlock = result.content?.find((c) => c.type === "text");
        if (textBlock && "text" in textBlock) {
          setJoke(textBlock.text);
        }
        setLoading(false);
      };
    },
  });

  const loadJoke = useCallback(async () => {
    setFetchingNew(true);
    try {
      const newJoke = await fetchRandomJoke();
      setJoke(newJoke);
    } catch (e) {
      console.error("Failed to fetch joke:", e);
    } finally {
      setFetchingNew(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (app && joke === null) loadJoke();
  }, [app, joke, loadJoke]);

  const handleSendToLLM = useCallback(async () => {
    if (!app || !joke) return;
    setSent(true);
    try {
      await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Here's a dad joke for you to comment on:\n\n"${joke}"\n\nPlease share your thoughts, rate it, or add a witty response!`,
          },
        ],
      });
    } finally {
      setTimeout(() => setSent(false), 2000);
    }
  }, [app, joke]);

  if (error) return <div className={styles.error}><strong>Error:</strong> {error.message}</div>;
  if (!app) return <div className={styles.loading}>Connecting...</div>;

  return (
    <main className={styles.main}>
      <h2 className={styles.heading}>Dad Joke 2</h2>

      <div className={styles.jokeCard}>
        {loading && joke === null ? (
          <p className={styles.loadingText}>Loading joke...</p>
        ) : (
          <p className={styles.jokeText}>{joke ?? "No joke loaded"}</p>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.buttonSecondary}
          onClick={loadJoke}
          disabled={fetchingNew}
        >
          {fetchingNew ? "Loading…" : "Another joke"}
        </button>
        <button
          className={styles.button}
          onClick={handleSendToLLM}
          disabled={sent || !joke}
        >
          {sent ? "Sent!" : "Send to LLM for comment"}
        </button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DadJokesApp />
  </StrictMode>,
);
