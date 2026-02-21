import React from 'react';
import './ModelSelector.css';

export type LLMModel = 'claude' | 'gpt-4' | 'gemini';

interface ModelOption {
  id: LLMModel;
  name: string;
  description: string;
  available: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude', name: 'Claude 3.5 Sonnet', description: 'Anthropic', available: true },
  { id: 'gpt-4', name: 'GPT-4 Turbo', description: 'OpenAI', available: false },
  { id: 'gemini', name: 'Gemini Pro', description: 'Google', available: false },
];

interface ModelSelectorProps {
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
  disabled?: boolean;
  availableModels?: LLMModel[];
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  availableModels,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0];

  const getAvailability = (modelId: LLMModel): boolean => {
    if (availableModels) {
      return availableModels.includes(modelId);
    }
    return MODEL_OPTIONS.find(m => m.id === modelId)?.available ?? false;
  };

  const handleSelect = (model: LLMModel) => {
    if (getAvailability(model) && !disabled) {
      onModelChange(model);
      setIsOpen(false);
    }
  };

  return (
    <div className={`model-selector ${disabled ? 'model-selector--disabled' : ''}`} ref={dropdownRef}>
      <button
        className="model-selector__trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        type="button"
      >
        <span className="model-selector__name">{selectedOption.name}</span>
        <span className="model-selector__arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && (
        <div className="model-selector__dropdown">
          {MODEL_OPTIONS.map((option) => {
            const isAvailable = getAvailability(option.id);
            return (
              <button
                key={option.id}
                className={`model-selector__option ${
                  option.id === selectedModel ? 'model-selector__option--selected' : ''
                } ${!isAvailable ? 'model-selector__option--disabled' : ''}`}
                onClick={() => handleSelect(option.id)}
                disabled={!isAvailable}
                type="button"
              >
                <span className="model-selector__option-name">{option.name}</span>
                <span className="model-selector__option-desc">{option.description}</span>
                {!isAvailable && <span className="model-selector__option-badge">Unavailable</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
