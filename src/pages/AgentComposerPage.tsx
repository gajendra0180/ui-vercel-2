import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import {
  createAgent,
  getAvailableServersForTools,
  getAllAvailableTools,
  Agent,
  ServerEntry
} from "../utils/api";
import { Spinner } from "../components/Spinner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import "./AgentComposerPage.css";

/**
 * Type guard to validate LLM provider values
 */
function isValidLLMProvider(value: unknown): value is "claude" | "gpt" | "gemini" {
  return value === "claude" || value === "gpt" || value === "gemini";
}

export function AgentComposerPage() {
  const account = useActiveAccount();

  // Form state
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [llmProvider, setLlmProvider] = useState<"claude" | "gpt" | "gemini">("claude");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [starterPrompts, setStarterPrompts] = useState<string[]>([""]);
  const [isPublic, setIsPublic] = useState(true);

  // UI state
  const [loading, setLoading] = useState(true);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [allTools, setAllTools] = useState<Array<{ id: string; label: string; serverName: string; description: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);

  // Confirmation dialog state
  const [showRemovePromptConfirm, setShowRemovePromptConfirm] = useState(false);
  const [promptToRemoveIndex, setPromptToRemoveIndex] = useState<number | null>(null);

  // Load available servers and tools
  useEffect(() => {
    loadServersAndTools();
  }, []);

  const loadServersAndTools = async () => {
    try {
      setLoading(true);
      const serversData = await getAvailableServersForTools();
      setServers(serversData);
      const tools = getAllAvailableTools(serversData);
      setAllTools(tools);
    } catch (err) {
      console.error("Failed to load servers:", err);
      setError("Failed to load available APIs");
    } finally {
      setLoading(false);
    }
  };

  const addStarterPrompt = () => {
    setStarterPrompts([...starterPrompts, ""]);
  };

  const removeStarterPrompt = (index: number) => {
    setStarterPrompts(starterPrompts.filter((_, i) => i !== index));
  };

  const handleRemovePromptClick = (index: number) => {
    setPromptToRemoveIndex(index);
    setShowRemovePromptConfirm(true);
  };

  const handleConfirmRemovePrompt = () => {
    if (promptToRemoveIndex !== null) {
      removeStarterPrompt(promptToRemoveIndex);
      setPromptToRemoveIndex(null);
      setShowRemovePromptConfirm(false);
    }
  };

  const updateStarterPrompt = (index: number, value: string) => {
    const updated = [...starterPrompts];
    updated[index] = value;
    setStarterPrompts(updated);
  };

  const toggleTool = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId)
        ? prev.filter(t => t !== toolId)
        : [...prev, toolId]
    );
  };

  /**
   * Handle keyboard navigation for tool cards
   * Space or Enter key toggles tool selection
   */
  const handleToolKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, toolId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTool(toolId);
    }
  };

  const validateForm = (): boolean => {
    if (!agentName.trim()) {
      setError("Agent name is required");
      return false;
    }
    if (!agentDescription.trim()) {
      setError("Agent description is required");
      return false;
    }
    if (selectedTools.length === 0) {
      setError("Select at least one API for your agent");
      return false;
    }
    const validPrompts = starterPrompts.filter(p => p.trim());
    if (validPrompts.length === 0) {
      setError("Add at least one starter prompt");
      return false;
    }
    return true;
  };

  const handleCreateAgent = async () => {
    if (!account || !validateForm()) {
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(false);

    try {
      const validPrompts = starterPrompts.filter(p => p.trim());

      const result = await createAgent({
        name: agentName.trim(),
        description: agentDescription.trim(),
        creator: account.address,
        llmProvider,
        availableTools: selectedTools,
        starterPrompts: validPrompts,
        isPublic,
      });

      if (result.success && result.agent) {
        setSuccess(true);
        setCreatedAgent(result.agent);
        // Reset form
        setAgentName("");
        setAgentDescription("");
        setSelectedTools([]);
        setStarterPrompts([""]);
        setLlmProvider("claude");
      } else {
        setError(result.error || "Failed to create agent");
      }
    } catch (err: unknown) {
      setError(err.message || "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  if (!account) {
    return (
      <div className="agent-composer-page">
        <div className="connect-prompt">
          <h2>👋 Connect Your Wallet</h2>
          <p>Please connect your wallet to create agents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-composer-page">
      <div className="composer-header">
        <h1>🤖 Agent Composer</h1>
        <p>Create your own AI agent powered by decentralized APIs</p>
      </div>

      <div className="composer-content">
        {/* Success Message */}
        {success && createdAgent && (
          <div className="success-card">
            <div className="success-icon">✅</div>
            <h3>Agent Created Successfully!</h3>
            <p className="success-agent-name">{createdAgent.name}</p>
            <div className="agent-details">
              <div className="detail">
                <span className="label">Agent ID:</span>
                <code className="value">{createdAgent.id}</code>
              </div>
              <div className="detail">
                <span className="label">Tools:</span>
                <span className="value">{createdAgent.availableTools.length} APIs selected</span>
              </div>
              <div className="detail">
                <span className="label">Starter Prompts:</span>
                <span className="value">{createdAgent.starterPrompts.length} prompts</span>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setSuccess(false);
                setCreatedAgent(null);
              }}
            >
              Create Another Agent
            </button>
          </div>
        )}

        {/* Agent Creation Form */}
        {!success && (
          <div className="composer-form-section">
            {/* Step 1: Basic Info */}
            <div className="form-step">
              <div className="step-header">
                <h2>1️⃣ Agent Basics</h2>
                <p>Define your agent's name and purpose</p>
              </div>

              <div className="form-group">
                <label>Agent Name *</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g., Pool Analyzer, TVL Tracker, API Explorer"
                  className="input"
                  maxLength={100}
                />
                <small>{agentName.length}/100 characters</small>
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value)}
                  placeholder="Describe what your agent does and what problems it solves..."
                  rows={3}
                  className="input textarea"
                  maxLength={500}
                />
                <small>{agentDescription.length}/500 characters</small>
              </div>

              <div className="form-group">
                <label>LLM Provider *</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="llmProvider"
                      value="claude"
                      checked={llmProvider === "claude"}
                      onChange={(e) => {
                        if (isValidLLMProvider(e.target.value)) {
                          setLlmProvider(e.target.value);
                        }
                      }}
                    />
                    <span className="radio-label">
                      <strong>Claude 3.5 Sonnet</strong>
                      <small>Requires paid API credits</small>
                    </span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="llmProvider"
                      value="gpt"
                      checked={llmProvider === "gpt"}
                      onChange={(e) => {
                        if (isValidLLMProvider(e.target.value)) {
                          setLlmProvider(e.target.value);
                        }
                      }}
                      disabled
                    />
                    <span className="radio-label">
                      <strong>GPT-4 Turbo</strong>
                      <small>Currently unavailable</small>
                    </span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="llmProvider"
                      value="gemini"
                      checked={llmProvider === "gemini"}
                      onChange={(e) => {
                        if (isValidLLMProvider(e.target.value)) {
                          setLlmProvider(e.target.value);
                        }
                      }}
                      disabled
                    />
                    <span className="radio-label">
                      <strong>Gemini 2.0 Flash</strong>
                      <small>Currently unavailable</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  <span>Make agent public (anyone can discover and use it)</span>
                </label>
              </div>
            </div>

            {/* Step 2: Tool Selection */}
            <div className="form-step">
              <div className="step-header">
                <h2>2️⃣ Select APIs</h2>
                <p>Choose which APIs your agent can use ({selectedTools.length} selected)</p>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                  <Spinner size="large" label="Loading available APIs..." />
                </div>
              ) : allTools.length === 0 ? (
                <div className="empty-state">
                  <p>No APIs available yet. Create some APIs in the marketplace first.</p>
                </div>
              ) : (
                <div className="tools-grid">
                  {allTools.map((tool) => (
                    <div
                      key={tool.id}
                      className={`tool-card ${selectedTools.includes(tool.id) ? "selected" : ""}`}
                      onClick={() => toggleTool(tool.id)}
                      onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedTools.includes(tool.id)}
                      aria-label={`${tool.label} from ${tool.serverName} - ${selectedTools.includes(tool.id) ? "selected" : "not selected"}`}
                    >
                      <div className="tool-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedTools.includes(tool.id)}
                          onChange={() => toggleTool(tool.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="tool-content">
                        <h4>{tool.label}</h4>
                        <small className="tool-server">{tool.serverName}</small>
                        <p className="tool-description">{tool.description}</p>
                        <code className="tool-id">{tool.id}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 3: Starter Prompts */}
            <div className="form-step">
              <div className="step-header">
                <h2>3️⃣ Starter Prompts</h2>
                <p>Suggest conversation starters for users</p>
              </div>

              <div className="prompts-list">
                {starterPrompts.map((prompt, index) => (
                  <div key={index} className="prompt-input-group">
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => updateStarterPrompt(index, e.target.value)}
                      placeholder={`e.g., "What's the current TVL?" or "Show me the latest APIs"`}
                      className="input"
                      maxLength={150}
                    />
                    {starterPrompts.length > 1 && (
                      <button
                        className="btn btn-icon btn-remove"
                        onClick={() => handleRemovePromptClick(index)}
                        title="Remove prompt"
                        aria-label={`Remove prompt: "${prompt}"`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                className="btn btn-secondary"
                onClick={addStarterPrompt}
              >
                ➕ Add Another Prompt
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-box">
                <strong>❌ Error:</strong> {error}
              </div>
            )}

            {/* Create Button */}
            <div className="form-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleCreateAgent}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <span className="spinner"></span>
                    Creating Agent...
                  </>
                ) : (
                  "🚀 Create Agent"
                )}
              </button>
              <p className="form-help">
                Your agent will be created instantly with access to the selected APIs.
              </p>
            </div>
          </div>
        )}

        {/* Confirmation Dialog for Removing Prompts */}
        <ConfirmDialog
          isOpen={showRemovePromptConfirm}
          title="Remove Starter Prompt?"
          message={
            promptToRemoveIndex !== null && starterPrompts[promptToRemoveIndex] ? (
              <>
                <p>This will permanently remove the following prompt:</p>
                <code style={{ display: 'block', marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                  "{starterPrompts[promptToRemoveIndex]}"
                </code>
                <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '0.9em', opacity: 0.8 }}>
                  This action cannot be undone.
                </p>
              </>
            ) : (
              "Remove this prompt?"
            )
          }
          variant="warning"
          confirmText="Remove Prompt"
          cancelText="Keep It"
          onConfirm={handleConfirmRemovePrompt}
          onCancel={() => {
            setShowRemovePromptConfirm(false);
            setPromptToRemoveIndex(null);
          }}
        />
      </div>
    </div>
  );
}
