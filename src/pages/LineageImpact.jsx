import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  FiArrowLeft, FiRefreshCw, FiZoomIn, FiZoomOut, 
  FiMaximize, FiMap, FiBox, FiArrowDown, FiArrowUp, 
  FiInfo, FiFile, FiFileText
} from 'react-icons/fi';
import Card from '../components/Card';
import { getFileDetails } from '../api/fileService';
import { getImpactAnalysis } from '../api/lineageService';
import { formatDate, formatBytes } from '../utils/formatters';
import './LineageImpact.css';

// A separate component for the graph visualization
const LineageGraph = ({ impactData, direction }) => {
  const svgRef = useRef(null);
  const graphContainerRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Graph layout parameters
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 60;
  const LEVEL_GAP = 150;
  const NODE_GAP = 20;
  
  useEffect(() => {
    if (!impactData || !impactData.impactGraph) return;
    
    renderGraph();
  }, [impactData, transform]);
  
  const renderGraph = () => {
    if (!svgRef.current || !impactData.impactGraph) return;
    
    const graph = impactData.impactGraph;
    const nodes = graph.nodes;
    const edges = graph.edges;
    
    // Group nodes by level
    const nodesByLevel = nodes.reduce((acc, node) => {
      if (!acc[node.level]) acc[node.level] = [];
      acc[node.level].push(node);
      return acc;
    }, {});
    
    // Calculate layout for each node
    const nodeLayout = {};
    const levels = Object.keys(nodesByLevel).sort((a, b) => {
      // For upstream direction, reverse the order to keep the root node on the left
      return direction === 'upstream' 
        ? parseInt(b) - parseInt(a) 
        : parseInt(a) - parseInt(b);
    });
    
    levels.forEach((level, levelIndex) => {
      const levelNodes = nodesByLevel[level];
      const levelY = levelIndex * (NODE_HEIGHT + LEVEL_GAP);
      
      levelNodes.forEach((node, nodeIndex) => {
        const levelWidth = levelNodes.length * NODE_WIDTH + (levelNodes.length - 1) * NODE_GAP;
        const startX = -levelWidth / 2 + NODE_WIDTH / 2;
        const nodeX = startX + nodeIndex * (NODE_WIDTH + NODE_GAP);
        
        nodeLayout[node.id] = {
          x: nodeX,
          y: levelY,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          node
        };
      });
    });
    
    // Create SVG elements
    const svg = svgRef.current;
    const containerWidth = graphContainerRef.current.clientWidth;
    const containerHeight = graphContainerRef.current.clientHeight;
    
    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // Create definitions for arrowheads
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    
    // Create the transform group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${containerWidth/2 + transform.x}, ${150 + transform.y}) scale(${transform.scale})`);
    
    // Draw edges first so they appear below nodes
    edges.forEach(edge => {
      const sourceNode = nodeLayout[edge.source];
      const targetNode = nodeLayout[edge.target];
      
      if (sourceNode && targetNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Calculate path
        const sourceX = sourceNode.x;
        const sourceY = sourceNode.y + sourceNode.height / 2;
        const targetX = targetNode.x;
        const targetY = targetNode.y - targetNode.height / 2;
        
        // Create a curved path
        const controlPoint1X = sourceX;
        const controlPoint1Y = sourceY + LEVEL_GAP/3;
        const controlPoint2X = targetX;
        const controlPoint2Y = targetY - LEVEL_GAP/3;
        
        const path = `M ${sourceX} ${sourceY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${targetX} ${targetY}`;
        
        line.setAttribute('d', path);
        line.setAttribute('stroke', '#3498db');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('fill', 'none');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        
        // Add relationship type label
        const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        
        // Calculate middle of the curve
        const labelX = (sourceX + targetX) / 2;
        const labelY = (sourceY + targetY) / 2 - 10;
        
        text.setAttribute('x', labelX);
        text.setAttribute('y', labelY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '12px');
        text.setAttribute('fill', '#6c757d');
        text.textContent = edge.label;
        
        // Add a background rectangle for the text
        const bbox = text.getBBox ? text.getBBox() : { x: labelX - 50, y: labelY - 15, width: 100, height: 20 };
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bbox.x - 5);
        rect.setAttribute('y', bbox.y - 2);
        rect.setAttribute('width', bbox.width + 10);
        rect.setAttribute('height', bbox.height + 4);
        rect.setAttribute('fill', 'white');
        rect.setAttribute('opacity', '0.8');
        rect.setAttribute('rx', '3');
        
        textGroup.appendChild(rect);
        textGroup.appendChild(text);
        
        g.appendChild(line);
        g.appendChild(textGroup);
      }
    });
    
    // Draw nodes
    Object.values(nodeLayout).forEach(({ x, y, width, height, node }) => {
      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeGroup.setAttribute('transform', `translate(${x - width/2}, ${y - height/2})`);
      nodeGroup.setAttribute('class', 'node');
      nodeGroup.setAttribute('data-id', node.id);
      
      // Node background
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', width);
      rect.setAttribute('height', height);
      rect.setAttribute('rx', '4');
      
      // Root node has different styling
      if (node.isRoot) {
        rect.setAttribute('fill', '#e3faff');
        rect.setAttribute('stroke', '#4dabf7');
      } else {
        rect.setAttribute('fill', '#f8f9fa');
        rect.setAttribute('stroke', '#dee2e6');
      }
      rect.setAttribute('stroke-width', '2');
      
      // File type badge
      const typeBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      typeBadge.setAttribute('x', '8');
      typeBadge.setAttribute('y', '8');
      typeBadge.setAttribute('width', '40');
      typeBadge.setAttribute('height', '18');
      typeBadge.setAttribute('rx', '3');
      typeBadge.setAttribute('fill', '#e7f5ff');
      
      const typeBadgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      typeBadgeText.setAttribute('x', '28');
      typeBadgeText.setAttribute('y', '21');
      typeBadgeText.setAttribute('text-anchor', 'middle');
      typeBadgeText.setAttribute('font-size', '10px');
      typeBadgeText.setAttribute('fill', '#339af0');
      typeBadgeText.setAttribute('font-weight', 'bold');
      typeBadgeText.textContent = node.type.toUpperCase();
      
      // File name
      const filename = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      filename.setAttribute('x', '10');
      filename.setAttribute('y', '40');
      filename.setAttribute('font-size', '12px');
      filename.setAttribute('fill', '#212529');
      
      // Truncate long filenames
      let displayName = node.label;
      if (displayName.length > 25) {
        displayName = displayName.substring(0, 22) + '...';
      }
      filename.textContent = displayName;
      
      nodeGroup.appendChild(rect);
      nodeGroup.appendChild(typeBadge);
      nodeGroup.appendChild(typeBadgeText);
      nodeGroup.appendChild(filename);
      
      nodeGroup.addEventListener('click', () => {
        // Navigate to file details (can be implemented)
        console.log('Node clicked:', node);
      });
      
      g.appendChild(nodeGroup);
    });
    
    svg.appendChild(g);
  };
  
  const handleZoomIn = () => {
    setTransform(prev => ({
      ...prev,
      scale: prev.scale * 1.2
    }));
  };
  
  const handleZoomOut = () => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.5, prev.scale / 1.2)
    }));
  };
  
  const handleReset = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };
  
  const handleMouseDown = (e) => {
    if (e.button === 0) { // Only left mouse button
      setDragging(true);
      setDragStart({
        x: e.clientX - transform.x,
        y: e.clientY - transform.y
      });
    }
  };
  
  const handleMouseMove = (e) => {
    if (dragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };
  
  const handleMouseUp = () => {
    setDragging(false);
  };
  
  const handleMouseLeave = () => {
    setDragging(false);
  };
  
  return (
    <div className="lineage-graph-container" ref={graphContainerRef}>
      <div className="graph-controls">
        <button className="control-btn" onClick={handleZoomIn} title="Zoom In">
          <FiZoomIn />
        </button>
        <button className="control-btn" onClick={handleZoomOut} title="Zoom Out">
          <FiZoomOut />
        </button>
        <button className="control-btn" onClick={handleReset} title="Reset View">
          <FiMaximize />
        </button>
      </div>
      
      <svg 
        className="lineage-graph" 
        ref={svgRef}
        width="100%" 
        height="100%"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      
      {!impactData?.impactGraph?.nodes.length && (
        <div className="empty-graph">
          <FiMap className="empty-icon" />
          <p>No lineage relationships found.</p>
        </div>
      )}
    </div>
  );
};

function LineageImpact() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [direction, setDirection] = useState('downstream');
  const [depth, setDepth] = useState(3);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get file details and impact analysis
        const [fileDetails, impact] = await Promise.all([
          getFileDetails(fileId),
          getImpactAnalysis(fileId, direction, depth)
        ]);
        
        setFile(fileDetails);
        setImpactData(impact);
        setError(null);
      } catch (err) {
        console.error('Error fetching lineage impact data:', err);
        setError('Failed to load impact analysis. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [fileId, direction, depth]);
  
  const handleDirectionChange = (newDirection) => {
    if (newDirection !== direction) {
      setDirection(newDirection);
    }
  };
  
  const handleDepthChange = (e) => {
    const newDepth = parseInt(e.target.value);
    setDepth(newDepth);
  };
  
  const handleGoBack = () => {
    navigate('/lineage');
  };
  
  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Loading impact analysis...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="lineage-impact-container">
      <div className="page-header">
        <button className="back-button" onClick={handleGoBack}>
          <FiArrowLeft /> Back to Lineage
        </button>
        <h1>File Lineage Impact Analysis</h1>
      </div>
      
      {file && (
        <Card className="file-info-card">
          <div className="file-header">
            <div className="file-icon">
              {file.file_type === 'csv' && <FiFileText size={24} />}
              {file.file_type === 'json' && <FiFile size={24} />}
              {file.file_type !== 'csv' && file.file_type !== 'json' && <FiBox size={24} />}
            </div>
            <div className="file-details">
              <h2>{file.filename}</h2>
              <div className="file-meta">
                <span className="file-type">{file.file_type.toUpperCase()}</span>
                <span className="file-size">{formatBytes(file.file_size)}</span>
                <span className="file-date">Uploaded: {formatDate(file.created_at)}</span>
              </div>
            </div>
          </div>
          
          <div className="impact-controls">
            <div className="direction-toggle">
              <span>Direction:</span>
              <div className="toggle-buttons">
                <button 
                  className={`toggle-btn ${direction === 'upstream' ? 'active' : ''}`}
                  onClick={() => handleDirectionChange('upstream')}
                >
                  <FiArrowUp className="btn-icon" /> Upstream (Inputs)
                </button>
                <button 
                  className={`toggle-btn ${direction === 'downstream' ? 'active' : ''}`}
                  onClick={() => handleDirectionChange('downstream')}
                >
                  <FiArrowDown className="btn-icon" /> Downstream (Outputs)
                </button>
              </div>
            </div>
            
            <div className="depth-selector">
              <label htmlFor="depth">
                Depth:
                <select 
                  id="depth" 
                  value={depth}
                  onChange={handleDepthChange}
                  className="depth-select"
                >
                  <option value="1">1 Level</option>
                  <option value="2">2 Levels</option>
                  <option value="3">3 Levels</option>
                  <option value="5">5 Levels</option>
                  <option value="10">10 Levels</option>
                </select>
              </label>
            </div>
            
            <button 
              className="btn btn-primary refresh-btn"
              onClick={() => window.location.reload()}
            >
              <FiRefreshCw className="btn-icon" /> Refresh
            </button>
          </div>
        </Card>
      )}
      
      <Card className="impact-graph-card">
        <div className="impact-title">
          <h3>
            {direction === 'downstream' 
              ? 'Downstream Impact (Files affected by changes)' 
              : 'Upstream Dependencies (Files that affect this file)'}
          </h3>
          <div className="impact-legend">
            <div className="legend-item">
              <div className="legend-color root"></div>
              <span>Selected File</span>
            </div>
            <div className="legend-item">
              <div className="legend-color related"></div>
              <span>Related Files</span>
            </div>
          </div>
        </div>
        
        <LineageGraph impactData={impactData} direction={direction} />
        
        {impactData && impactData.relationships && impactData.relationships.length > 0 && (
          <div className="impact-summary">
            <FiInfo className="info-icon" />
            <p>
              {direction === 'downstream' 
                ? `This file impacts ${impactData.relationships.length} ${impactData.relationships.length === 1 ? 'file' : 'files'} downstream.`
                : `This file depends on ${impactData.relationships.length} ${impactData.relationships.length === 1 ? 'file' : 'files'} upstream.`}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default LineageImpact;