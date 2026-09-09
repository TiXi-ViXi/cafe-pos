// src/components/ModifierModal.tsx
import { useState } from 'react';

export interface ModifierOption {
  modId: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  groupId: string;
  name: string;
  options: ModifierOption[];
}

interface ModifierModalProps {
  item: any;
  onConfirm: (item: any, selectedMods: ModifierOption[]) => void;
  onCancel: () => void;
}

export default function ModifierModal({ item, onConfirm, onCancel }: ModifierModalProps) {
  const [selectedMods, setSelectedMods] = useState<ModifierOption[]>([]);

  const toggleMod = (option: ModifierOption) => {
    // For now, allow multiple selections (can be restricted to radio buttons later)
    const exists = selectedMods.find(m => m.modId === option.modId);
    if (exists) {
      setSelectedMods(selectedMods.filter(m => m.modId !== option.modId));
    } else {
      setSelectedMods([...selectedMods, option]);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Customize {item.name}</h2>
        
        <div className="modifier-groups-container">
          {item.modifierGroups.map((group: ModifierGroup) => (
            <div key={group.groupId} className="modifier-group">
              <h3>{group.name}</h3>
              <div className="modifier-options">
                {group.options.map(opt => (
                  <button 
                    key={opt.modId}
                    className={`mod-btn ${selectedMods.find(m => m.modId === opt.modId) ? 'selected' : ''}`}
                    onClick={() => toggleMod(opt)}
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="confirm-btn" onClick={() => onConfirm(item, selectedMods)}>
            Add to Ticket
          </button>
        </div>
      </div>
    </div>
  );
}