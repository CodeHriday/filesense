import React, { useState } from 'react';
import { FiChevronRight, FiChevronLeft, FiChevronsRight, FiChevronsLeft } from 'react-icons/fi';
import './styles/DualListSelector.css';
import PropTypes from 'prop-types';

const DualListSelector = ({ 
  availableItems = [], 
  selectedItems = [], 
  onSelectionChange,
  availableTitle = 'Available Mappings',
  selectedTitle = 'Selected Mappings',
  itemLabelKey = 'mapping_name',
  itemValueKey = 'mapping_id'
}) => {
  const [selectedAvailable, setSelectedAvailable] = useState([]);
  const [selectedFromSelected, setSelectedFromSelected] = useState([]);

  const handleMoveToSelected = () => {
    const itemsToMove = availableItems.filter(item => 
      selectedAvailable.includes(item[itemValueKey])
    );
    onSelectionChange([...selectedItems, ...itemsToMove]);
    setSelectedAvailable([]);
  };

  const handleMoveToAvailable = () => {
    const idsToRemove = new Set(selectedFromSelected);
    const newSelected = selectedItems.filter(item => 
      !idsToRemove.has(item[itemValueKey])
    );
    onSelectionChange(newSelected);
    setSelectedFromSelected([]);
  };

  const handleMoveAllToSelected = () => {
    onSelectionChange([...selectedItems, ...availableItems]);
    setSelectedAvailable([]);
  };

  const handleMoveAllToAvailable = () => {
    onSelectionChange([]);
    setSelectedFromSelected([]);
  };

  const toggleAvailableSelection = (id) => {
    setSelectedAvailable(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleSelectedSelection = (id) => {
    setSelectedFromSelected(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="dual-list-selector">
      <div className="list-panel">
        <div className="panel-header">
          <h4>{availableTitle}</h4>
          <span className="item-count">{availableItems.length} items</span>
        </div>
        <div className="panel-body">
          {availableItems.length === 0 ? (
            <div className="empty-panel">All mappings selected</div>
          ) : (
            availableItems.map(item => (
              <div 
                key={item[itemValueKey]}
                className={`list-item ${selectedAvailable.includes(item[itemValueKey]) ? 'selected' : ''}`}
                onClick={() => toggleAvailableSelection(item[itemValueKey])}
              >
                <span>{item[itemLabelKey]}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="control-buttons">
        <button
          type="button"
          className="control-btn"
          onClick={handleMoveAllToSelected}
          disabled={availableItems.length === 0}
          title="Move all to selected"
        >
          <FiChevronsRight />
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={handleMoveToSelected}
          disabled={selectedAvailable.length === 0}
          title="Move selected to right"
        >
          <FiChevronRight />
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={handleMoveToAvailable}
          disabled={selectedFromSelected.length === 0}
          title="Move selected to left"
        >
          <FiChevronLeft />
        </button>
        <button
          type="button"
          className="control-btn"
          onClick={handleMoveAllToAvailable}
          disabled={selectedItems.length === 0}
          title="Move all to available"
        >
          <FiChevronsLeft />
        </button>
      </div>

      <div className="list-panel">
        <div className="panel-header">
          <h4>{selectedTitle}</h4>
          <span className="item-count">{selectedItems.length} items</span>
        </div>
        <div className="panel-body">
          {selectedItems.length === 0 ? (
            <div className="empty-panel">No mappings selected</div>
          ) : (
            selectedItems.map((item, index) => (
              <div 
                key={item[itemValueKey]}
                className={`list-item ${selectedFromSelected.includes(item[itemValueKey]) ? 'selected' : ''}`}
                onClick={() => toggleSelectedSelection(item[itemValueKey])}
              >
                <span className="item-order">{index + 1}.</span>
                <span>{item[itemLabelKey]}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
DualListSelector.propTypes = {
  availableItems: PropTypes.arrayOf(PropTypes.object),
  selectedItems: PropTypes.arrayOf(PropTypes.object),
  onSelectionChange: PropTypes.func.isRequired,
  availableTitle: PropTypes.string,
  selectedTitle: PropTypes.string,
  itemLabelKey: PropTypes.string,
  itemValueKey: PropTypes.string
};

DualListSelector.defaultProps = {
  availableItems: [],
  selectedItems: [],
  availableTitle: 'Available Mappings',
  selectedTitle: 'Selected Mappings',
  itemLabelKey: 'mapping_name',
  itemValueKey: 'mapping_id'
};
export default DualListSelector;
