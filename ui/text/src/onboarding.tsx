import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import ScrollableTextInput from "./ScrollableTextInput.js";
import type { GooseClient } from "@aaif/goose-acp";
import type { ProviderDetailEntry, ProviderConfigKey } from "@aaif/goose-acp";
import {
  CRANBERRY,
  TEAL,
  GOLD,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_DIM,
  RULE_COLOR,
} from "./colors.js";

type Phase =
  | "loading"
  | "select_provider"
  | "configure"
  | "saving"
  | "success"
  | "error";

interface OnboardingProps {
  client: GooseClient;
  width: number;
  height: number;
  onComplete: () => void;
}

const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];

function Spinner({ idx }: { idx: number }) {
  return (
    <Text color={CRANBERRY}>
      {SPINNER_FRAMES[idx % SPINNER_FRAMES.length]}
    </Text>
  );
}

function filterProviders(
  providers: ProviderDetailEntry[],
  query: string,
): ProviderDetailEntry[] {
  if (!query) return providers;
  const q = query.toLowerCase();
  return providers.filter(
    (p) =>
      p.displayName.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q),
  );
}

function requiredKeys(provider: ProviderDetailEntry): ProviderConfigKey[] {
  return provider.configKeys.filter(
    (k) => k.required && !k.oauthFlow && !k.deviceCodeFlow,
  );
}

export default function Onboarding({
  client,
  width,
  height,
  onComplete,
}: OnboardingProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [providers, setProviders] = useState<ProviderDetailEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderDetailEntry | null>(null);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [activeKeyIdx, setActiveKeyIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [spinIdx, setSpinIdx] = useState(0);
  const [showMasked, setShowMasked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setInterval(
      () => setSpinIdx((i) => (i + 1) % SPINNER_FRAMES.length),
      300,
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await client.goose.GooseProvidersDetails({});
        const sorted = [...resp.providers].sort((a, b) => {
          const aP = a.providerType === "Preferred" ? 0 : 1;
          const bP = b.providerType === "Preferred" ? 0 : 1;
          if (aP !== bP) return aP - bP;
          return a.displayName.localeCompare(b.displayName);
        });
        setProviders(sorted);
        setPhase("select_provider");
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : JSON.stringify(e));
        setPhase("error");
      }
    })();
  }, [client]);

  const filtered = filterProviders(providers, searchQuery);

  const saveProvider = useCallback(
    async (provider: ProviderDetailEntry, values: Record<string, string>) => {
      setPhase("saving");
      try {
        for (const [key, value] of Object.entries(values)) {
          const configKey = provider.configKeys.find((k) => k.name === key);
          if (configKey?.secret) {
            await client.goose.GooseSecretUpsert({ key, value });
          } else {
            await client.goose.GooseConfigUpsert({ key, value });
          }
        }
        await client.goose.GooseConfigUpsert({
          key: "GOOSE_PROVIDER",
          value: provider.name,
        });
        await client.goose.GooseConfigUpsert({
          key: "GOOSE_MODEL",
          value: provider.defaultModel,
        });
        setPhase("success");
        setTimeout(onComplete, 800);
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : JSON.stringify(e));
        setPhase("error");
      }
    },
    [client, onComplete],
  );

  const confirmProvider = useCallback(
    (provider: ProviderDetailEntry) => {
      const keys = requiredKeys(provider);
      if (keys.length === 0) {
        saveProvider(provider, {});
        return;
      }
      setSelectedProvider(provider);
      setKeyValues({});
      setActiveKeyIdx(0);
      setPhase("configure");
    },
    [saveProvider],
  );

  useInput((ch, key) => {
    if (phase === "select_provider") {
      if (key.escape) {
        if (searchQuery) {
          setSearchQuery("");
          setSelectedIdx(0);
          setScrollOffset(0);
          return;
        }
      }
      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (key.return) {
        const p = filtered[selectedIdx];
        if (p) confirmProvider(p);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        setSelectedIdx(0);
        setScrollOffset(0);
        return;
      }
      if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + ch);
        setSelectedIdx(0);
        setScrollOffset(0);
      }
      return;
    }

    if (phase === "configure" && selectedProvider) {
      const keys = requiredKeys(selectedProvider);
      const currentKey = keys[activeKeyIdx];
      if (!currentKey) return;

      if (key.escape) {
        setSelectedProvider(null);
        setPhase("select_provider");
        return;
      }
      if (key.tab && currentKey.secret) {
        setShowMasked((prev) => ({
          ...prev,
          [currentKey.name]: !prev[currentKey.name],
        }));
        return;
      }
      return;
    }

    if (phase === "error") {
      if (key.return || key.escape) {
        setErrorMsg("");
        setPhase("select_provider");
      }
      return;
    }

    if (phase === "success") {
      if (key.return) onComplete();
    }
  });

  useEffect(() => {
    if (phase === "select_provider") {
      const maxVisible = Math.max(height - 14, 3);
      if (selectedIdx < scrollOffset) {
        setScrollOffset(selectedIdx);
      } else if (selectedIdx >= scrollOffset + maxVisible) {
        setScrollOffset(selectedIdx - maxVisible + 1);
      }
    }
  }, [selectedIdx, phase, height, scrollOffset]);

  const innerWidth = Math.max(width - 4, 20);

  if (phase === "loading") {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width={width}
        height={height}
      >
        <Spinner idx={spinIdx} />
        <Text color={TEXT_DIM}> loading providers…</Text>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" width={width} height={height} paddingX={2}>
        <Box height={Math.max(Math.floor((height - 6) / 2), 1)} />
        <Text color={CRANBERRY} bold>✗ Setup error</Text>
        {errorMsg ? <Text color={TEXT_PRIMARY}>{errorMsg}</Text> : null}
        <Box marginTop={1}>
          <Text color={TEXT_DIM}>press enter to retry</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "saving") {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width={width}
        height={height}
      >
        <Spinner idx={spinIdx} />
        <Text color={TEXT_DIM}> saving configuration…</Text>
      </Box>
    );
  }

  if (phase === "success") {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width={width}
        height={height}
      >
        <Text color={TEAL} bold>
          ✓ Provider configured
        </Text>
        {selectedProvider && (
          <Text color={TEXT_SECONDARY}>
            Connected to {selectedProvider.displayName}
          </Text>
        )}
      </Box>
    );
  }

  if (phase === "configure" && selectedProvider) {
    const keys = requiredKeys(selectedProvider);
    const currentKey = keys[activeKeyIdx];
    const currentVal = keyValues[currentKey?.name ?? ""] ?? "";
    const masked =
      currentKey?.secret && !showMasked[currentKey?.name ?? ""];

    const handleSubmit = (value: string) => {
      if (!currentKey || !value.trim()) return;
      const newValues = { ...keyValues, [currentKey.name]: value };
      setKeyValues(newValues);
      if (activeKeyIdx < keys.length - 1) {
        setActiveKeyIdx(activeKeyIdx + 1);
        setShowMasked({});
      } else {
        saveProvider(selectedProvider, newValues);
      }
    };

    return (
      <Box flexDirection="column" width={width} height={height} paddingX={2}>
        <Box height={Math.max(Math.floor((height - 12) / 2), 0)} />
        <Box flexDirection="column" width={innerWidth}>
          <Text color={TEXT_PRIMARY} bold>
            Configure {selectedProvider.displayName}
          </Text>
          {selectedProvider.description ? (
            <Text color={TEXT_DIM}>{selectedProvider.description}</Text>
          ) : null}
          <Box marginTop={1} />

          {keys.map((k, i) => (
            <Box key={k.name} marginBottom={i === activeKeyIdx ? 0 : 0}>
              <Text color={i === activeKeyIdx ? GOLD : TEXT_DIM}>
                {i < activeKeyIdx ? "✓ " : i === activeKeyIdx ? "▸ " : "  "}
              </Text>
              <Text
                color={i === activeKeyIdx ? TEXT_PRIMARY : TEXT_DIM}
                bold={i === activeKeyIdx}
              >
                {k.name}
              </Text>
              {i < activeKeyIdx && (
                <Text color={TEAL}> ••••••</Text>
              )}
            </Box>
          ))}

          {currentKey && (
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text color={CRANBERRY} bold>
                  {"❯ "}
                </Text>
                <ScrollableTextInput
                  value={currentVal}
                  onChange={(value) =>
                    setKeyValues((prev) => ({
                      ...prev,
                      [currentKey.name]: value,
                    }))
                  }
                  onSubmit={handleSubmit}
                  mask={masked ? "•" : undefined}
                  maxDisplayWidth={innerWidth - 4}
                />
              </Box>
              <Box marginTop={0}>
                <Text color={TEXT_DIM}>
                  enter to confirm · esc to go back
                  {currentKey.secret && (
                    <>
                      {" · tab to "}
                      {masked ? "reveal" : "hide"}
                    </>
                  )}
                </Text>
              </Box>
            </Box>
          )}

          {selectedProvider.setupSteps &&
            selectedProvider.setupSteps.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color={TEXT_DIM}>Setup steps:</Text>
                {selectedProvider.setupSteps.map((step, i) => (
                  <Text key={i} color={TEXT_DIM}>
                    {" "}
                    {i + 1}. {step}
                  </Text>
                ))}
              </Box>
            )}
        </Box>
      </Box>
    );
  }

  const maxVisible = Math.max(height - 14, 3);
  const visibleProviders = filtered.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  );
  const aboveCount = scrollOffset;
  const belowCount = Math.max(
    filtered.length - scrollOffset - maxVisible,
    0,
  );

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={2}>
      <Box height={2} />
      <Text color={TEXT_PRIMARY} bold>
        Welcome to goose
      </Text>
      <Text color={TEXT_DIM}>
        Connect an AI model provider to get started.
      </Text>
      <Box marginTop={1}>
        <Box
          borderStyle="round"
          borderColor={RULE_COLOR}
          paddingX={1}
          width={innerWidth}
        >
          <Text color={CRANBERRY} bold>
            {"❯ "}
          </Text>
          <Text color={searchQuery ? TEXT_PRIMARY : TEXT_DIM}>
            {searchQuery || "search providers…"}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {aboveCount > 0 && (
          <Text color={TEXT_DIM}>  ▲ {aboveCount} more</Text>
        )}
        {visibleProviders.map((p, i) => {
          const realIdx = i + scrollOffset;
          const active = realIdx === selectedIdx;
          return (
            <Box key={p.name}>
              <Text color={active ? GOLD : RULE_COLOR}>
                {active ? "▸ " : "  "}
              </Text>
              <Text color={active ? TEXT_PRIMARY : TEXT_SECONDARY} bold={active}>
                {p.displayName}
              </Text>
              {p.providerType === "Preferred" && (
                <Text color={TEAL}> ★</Text>
              )}
              {p.isConfigured && (
                <Text color={TEAL}> ✓</Text>
              )}
            </Box>
          );
        })}
        {belowCount > 0 && (
          <Text color={TEXT_DIM}>  ▼ {belowCount} more</Text>
        )}
        {filtered.length === 0 && (
          <Text color={TEXT_DIM}>  no matching providers</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={TEXT_DIM}>
          ↑↓ navigate · enter select · type to search
        </Text>
      </Box>
    </Box>
  );
}
