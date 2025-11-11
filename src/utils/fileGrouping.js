/**
 * File Grouping Utilities
 * 
 * Organizes flat file arrays into hierarchical structures
 * for display: Projects > Subprojects > Files
 */

/**
 * Group files by project and subproject hierarchy
 * @param {Array} files - Flat array of file objects
 * @returns {Array} - Hierarchical structure of projects containing subprojects containing files
 */
export function groupFilesByProject(files) {
  if (!files || files.length === 0) {
    return [];
  }

  // Create a map to track projects
  const projectMap = new Map();

  files.forEach(file => {
    const projectId = file.project_id || 0;
    const projectName = file.project_name || 'No Project';
    const subProjectId = file.sub_project_id || null;
    const subProjectName = file.sub_project_name || null;

    // Get or create project entry
    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        projectId,
        projectName,
        filesCount: 0,
        subprojects: new Map(),
        unassignedFiles: []
      });
    }

    const project = projectMap.get(projectId);
    project.filesCount++;

    // Handle files with subprojects
    if (subProjectId) {
      // Get or create subproject entry
      if (!project.subprojects.has(subProjectId)) {
        project.subprojects.set(subProjectId, {
          subProjectId,
          subProjectName,
          filesCount: 0,
          items: []
        });
      }

      const subproject = project.subprojects.get(subProjectId);
      subproject.filesCount++;
      subproject.items.push(file);
    } else {
      // Files without subprojects
      project.unassignedFiles.push(file);
    }
  });

  // Convert maps to arrays
  const result = Array.from(projectMap.values()).map(project => ({
    ...project,
    subprojects: Array.from(project.subprojects.values())
  }));

  // Sort projects by name
  result.sort((a, b) => a.projectName.localeCompare(b.projectName));

  // Sort subprojects within each project by name
  result.forEach(project => {
    project.subprojects.sort((a, b) => 
      (a.subProjectName || '').localeCompare(b.subProjectName || '')
    );
  });

  return result;
}

/**
 * Initialize expansion state for all projects and subprojects
 * @param {Array} groupedProjects - Hierarchical project structure
 * @param {boolean} defaultExpanded - Whether to expand all by default
 * @returns {Object} - Object with expansion state keyed by project/subproject IDs
 */
export function initializeExpansionState(groupedProjects, defaultExpanded = true) {
  const state = {};

  groupedProjects.forEach(project => {
    // Project expansion state
    state[`project-${project.projectId}`] = defaultExpanded;

    // Subproject expansion state
    project.subprojects.forEach(subproject => {
      state[`subproject-${project.projectId}-${subproject.subProjectId}`] = defaultExpanded;
    });

    // Handle unassigned files section
    if (project.unassignedFiles.length > 0) {
      state[`subproject-${project.projectId}-unassigned`] = defaultExpanded;
    }
  });

  return state;
}

/**
 * Auto-expand sections that contain search matches
 * @param {Array} groupedProjects - Hierarchical project structure
 * @param {Object} currentExpansionState - Current expansion state
 * @returns {Object} - Updated expansion state with matching sections expanded
 */
export function autoExpandMatchingSections(groupedProjects, currentExpansionState) {
  const newState = { ...currentExpansionState };

  groupedProjects.forEach(project => {
    let hasMatches = false;

    // Check subprojects for matches
    project.subprojects.forEach(subproject => {
      if (subproject.items.length > 0) {
        hasMatches = true;
        newState[`subproject-${project.projectId}-${subproject.subProjectId}`] = true;
      }
    });

    // Check unassigned files
    if (project.unassignedFiles.length > 0) {
      hasMatches = true;
      newState[`subproject-${project.projectId}-unassigned`] = true;
    }

    // Expand project if it has any matches
    if (hasMatches) {
      newState[`project-${project.projectId}`] = true;
    }
  });

  return newState;
}
