import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./dad-jokes-app.module.css";

function getJokeText(
  result: { isError?: boolean; content?: Array<{ type: string; text?: string }> },
): string | null {
  if (result.isError) {
    return null;
  }

  const textBlock = result.content?.find((content) => content.type === "text");
  if (!textBlock) return null;
  // In some cases, textBlock.text may itself be an object with a 'text' property
  if (typeof textBlock.text === "string") {
    return textBlock.text;
  }
  if (textBlock.text && typeof textBlock.text === "object" && "text" in textBlock.text) {
    // @ts-ignore
    return textBlock.text.text ?? null;
  }
  return null;
}

function DadJokesApp() {
  const [joke, setJoke] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingNew, setFetchingNew] = useState(false);
  const [sent, setSent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "Dad Jokes", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.onerror = console.error;
      app.ontoolresult = (result) => {
        const jokeText = getJokeText(result);
        if (jokeText) {
          setJoke(jokeText);
          setLoadError(null);
        } else {
          setLoadError("Failed to load joke.");
        }
        setLoading(false);
      };
    },
  });

  const loadJoke = useCallback(async () => {
    if (!app) return;

    setFetchingNew(true);
    setLoadError(null);
    try {
      const result = await app.callServerTool({ name: "dad-joke", arguments: {} });
      const jokeText = getJokeText(result);

      if (!jokeText) {
        throw new Error("Tool did not return a joke");
      }

      setJoke(jokeText);
    } catch (e) {
      console.error("Failed to fetch joke:", e);
      setLoadError("Failed to load joke.");
    } finally {
      setFetchingNew(false);
      setLoading(false);
    }
  }, [app]);

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
      <h2 className={styles.heading}>Dad Joke</h2>

      <div className={styles.jokeCard}>
        {loading && joke === null ? (
          <p className={styles.loadingText}>Loading joke...</p>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
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
