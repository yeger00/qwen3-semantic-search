import React, { useEffect, useRef, useState } from 'react';
import './MemoryVisualizer.css';
import { cosineSimilarity } from '../memory/similarity';

interface MemoryNode {
  id: number;
  text: string;
  x: number;
  y: number;
  radius: number;
  score?: number;
  connections: number[];
  embedding: number[];
  baseRadius: number;
  pulse: number;
}

interface TooltipData {
  node: MemoryNode;
  relatedNodes: { text: string; score: number }[];
}

interface MemoryVisualizerProps {
  memoryItems: string[];
  searchResults: { text: string; score: number }[];
  isLoaded: boolean;
  embeddings: number[][];
  getRelevance: (score: number) => 'high-relevance' | 'medium-relevance' | 'low-relevance';
}

const MemoryVisualizer: React.FC<MemoryVisualizerProps> = ({ 
  memoryItems, 
  searchResults,
  isLoaded,
  embeddings,
  getRelevance
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<MemoryNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<TooltipData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'position-top' | 'position-bottom'>('position-top');
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const animationRef = useRef<number>(0);

  const renderRelevanceInfo = (score: number) => {
    const relevance = getRelevance(score);
    const relevanceLabel = relevance.replace('-relevance', '');
    const capitalizedLabel = relevanceLabel.charAt(0).toUpperCase() + relevanceLabel.slice(1);

    return (
      <p className={`score ${relevance}`}>
        Relevance: {score.toFixed(3)} ({capitalizedLabel})
      </p>
    );
  };

  useEffect(() => {
    if (!isLoaded || !memoryItems.length || !embeddings || embeddings.length !== memoryItems.length) return;

    const newNodes: MemoryNode[] = [];
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const layoutRadius = Math.min(canvasSize.width, canvasSize.height) * 0.35;
    
    const circumference = 2 * Math.PI * layoutRadius;
    const spacePerNode = circumference / memoryItems.length;
    const dynamicNodeRadius = Math.max(8, Math.min(30, spacePerNode * 0.4));

    const similarityMatrix: number[][] = [];
    
    for (let i = 0; i < embeddings.length; i++) {
      similarityMatrix[i] = [];
      
      for (let j = 0; j < embeddings.length; j++) {
        if (i === j) {
          similarityMatrix[i][j] = 0; // no self loops
        } else {
          similarityMatrix[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
        }
      }
    }
    
    const MAX_CONNECTIONS = 3; // top 3 edges (connections) per node
    
    memoryItems.forEach((text, id) => {
      const angle = (id / memoryItems.length) * Math.PI * 2;
      const x = centerX + layoutRadius * Math.cos(angle);
      const y = centerY + layoutRadius * Math.sin(angle);
      
      const similarities = [...similarityMatrix[id]];
      
      const connections: number[] = [];
      for (let i = 0; i < MAX_CONNECTIONS; i++) {
        if (similarities.length === 0) break;
        
        // find max similarity
        const maxSim = Math.max(...similarities);
        if (maxSim <= 0.1) break; // below threshold don't add
        
        const maxIndex = similarityMatrix[id].indexOf(maxSim);
        connections.push(maxIndex);
        
        similarities[maxIndex] = -1;
      }
      
      const result = searchResults.find(r => r.text === text);

      newNodes.push({
        id,
        text,
        x,
        y,
        radius: dynamicNodeRadius,
        score: result?.score,
        connections,
        embedding: embeddings[id],
        baseRadius: dynamicNodeRadius,
        pulse: 0
      });
    });
    
    setNodes(newNodes);
  }, [memoryItems, isLoaded, embeddings, canvasSize, searchResults]);

  useEffect(() => {
    if (searchResults.length === 0) {
      setNodes(prevNodes => prevNodes.map(node => ({ ...node, score: undefined })));
      return;
    }

    setNodes(prevNodes => {
      return prevNodes.map(node => {
        const result = searchResults.find(r => r.text === node.text);
        return { 
          ...node, 
          score: result?.score
        };
      });
    });
  }, [searchResults]);

  // Handle canvas resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);


  const drawCanvas = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    

    ctx.lineWidth = 1;
    nodes.forEach(node => {
      node.connections.forEach(connId => {
        const connectedNode = nodes[connId];
        
        if (!connectedNode) return;
        
        if (searchResults.length > 0) {
          const nodeRelevant = typeof node.score === 'number' && node.score > 0.3;
          const connRelevant = typeof connectedNode.score === 'number' && connectedNode.score > 0.3;
          
          if (nodeRelevant && connRelevant) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          } else {
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
          }
        } else {
          ctx.strokeStyle = 'rgba(180, 180, 180, 0.4)';
        }
        
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(connectedNode.x, connectedNode.y);
        ctx.stroke();
      });
    });
    

    nodes.forEach(node => {
      const targetRadius = node.baseRadius * (1 + (node.score || 0) * 0.5);
      node.radius += (targetRadius - node.radius) * 0.1; 

      if (node.score && node.score > 0.5) {
        node.pulse += (1 - node.pulse) * 0.1;
      } else {
        node.pulse += (0 - node.pulse) * 0.1;
      }
      const pulseAmount = Math.sin(time / 200) * node.pulse * 5;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + pulseAmount, 0, Math.PI * 2);
      
      if (searchResults.length > 0 && node.score !== undefined) {
        const relevance = getRelevance(node.score);
        let grad;
        if (relevance === 'high-relevance') {
          // highly relevant - gold
          grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
          grad.addColorStop(0, 'rgba(255, 193, 7, 1)');
          grad.addColorStop(1, 'rgba(255, 224, 130, 1)');
          ctx.fillStyle = grad;
          ctx.shadowColor = 'rgba(255, 193, 7, 0.7)';
          ctx.shadowBlur = 20;
        } else if (relevance === 'medium-relevance') {
          // mostly relevant - amber
          grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
          grad.addColorStop(0, 'rgba(217, 140, 0, 1)');
          grad.addColorStop(1, 'rgba(255, 180, 50, 1)');
          ctx.fillStyle = grad;
          ctx.shadowColor = 'rgba(217, 140, 0, 0.5)';
          ctx.shadowBlur = 15;
        } else {
          // mot relevant - gray
          ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
          ctx.shadowBlur = 0;
        }
      } else {
        // base node color
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
        grad.addColorStop(0, 'rgba(138, 112, 48, 1)');
        grad.addColorStop(1, 'rgba(191, 158, 87, 1)');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 0;
      }
      
      if (hoveredNode && node.id === hoveredNode.node.id) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.shadowColor = '#fd0';
        ctx.shadowBlur = 20;
      }
      
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (node.score && node.score > 0.5) {
        ctx.fillStyle = '#4d3a00'; 
      } else {
        ctx.fillStyle = '#fff';
      }
      
      ctx.fillText((node.id + 1).toString(), node.x, node.y);
    });
  };

  useEffect(() => {
    const animate = (time: number) => {
      drawCanvas(time);
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, canvasSize, hoveredNode, searchResults]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let foundNode: MemoryNode | null = null;
    for (const node of nodes) {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (distance < node.radius) {
        foundNode = node;
        break;
      }
    }

    if (foundNode) {
      if (!hoveredNode || foundNode.id !== hoveredNode.node.id) {
        // Calculate related nodes
        const related = nodes
          .filter(n => n.id !== foundNode!.id)
          .map(n => ({
            text: n.text,
            score: cosineSimilarity(foundNode!.embedding, n.embedding)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        
        setHoveredNode({ node: foundNode, relatedNodes: related });
        
        // Position tooltip
        const tooltipY = e.clientY - rect.top;
        setTooltipPosition(tooltipY < canvasSize.height * 0.65 ? 'position-bottom' : 'position-top');
      }
    } else {
      setHoveredNode(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
  };

  return (
    <div 
      className="memory-visualizer-container" 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas 
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="memory-visualizer-canvas" 
      />
      {hoveredNode && (
        <div 
          className={`node-tooltip ${tooltipPosition} ${hoveredNode ? 'visible' : ''}`}
          style={{
            left: hoveredNode.node.x, 
            top: hoveredNode.node.y
          }}
        >
          <div className="tooltip-content">
            <p>"{hoveredNode.node.text}"</p>
            {hoveredNode.node.score !== undefined && renderRelevanceInfo(hoveredNode.node.score)}
            <div className="tooltip-divider"></div>
            <div className="tooltip-section">
              <p className="tooltip-label">Embedding Vector:</p>
              <p className="tooltip-value">
                [{hoveredNode.node.embedding.slice(0, 3).map(v => v.toFixed(2)).join(', ')}, ...]
              </p>
            </div>
            <div className="tooltip-section">
              <p className="tooltip-label">Most Related:</p>
              <ul>
                {hoveredNode.relatedNodes.map((related, index) => (
                  <li key={index}>
                    <span className="related-text">"{related.text}"</span>
                    <span className="related-score">({related.score.toFixed(2)})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryVisualizer; 