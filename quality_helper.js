/**
 * Helper module to bridge Node.js and Python quality checks
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Calculate quality score from column data by calling the Python script
 * 
 * @param {Array} columns - Column metadata array
 * @param {Object} fileMetadata - File metadata object
 * @returns {Promise<Object>} - Quality score results
 */
async function calculateQualityScore(columns, fileMetadata) {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary JSON file with the data
      const tempInputPath = path.join(os.tmpdir(), `quality_input_${Date.now()}.json`);
      const tempOutputPath = path.join(os.tmpdir(), `quality_output_${Date.now()}.json`);
      
      // Prepare the input data
      const inputData = {
        columns,
        fileMetadata
      };
      
      // Write input data to temp file
      fs.writeFileSync(tempInputPath, JSON.stringify(inputData, null, 2));
      
      // Prepare and run the Python process
      const pythonProcess = spawn('python3', [
        '-c',
        `
import json
import sys
from datetime import datetime

try:
    # Load the input data from temp file
    with open("${tempInputPath}", "r") as f:
        input_data = json.load(f)
    
    columns = input_data.get("columns", [])
    file_metadata = input_data.get("fileMetadata", {})
    
    # Define weights for different quality dimensions (sum should be 1.0)
    weights = {
        "completeness": 0.3,  # How much of the data is present
        "consistency": 0.25,  # How consistent the data types and patterns are
        "validity": 0.2,     # How valid the data is against business rules
        "uniqueness": 0.15,  # How unique the values are
        "timeliness": 0.1    # How recent the data is
    }
    
    component_scores = {}
    total_rows = file_metadata.get("row_count", 100) if file_metadata else 100
    
    # Calculate COMPLETENESS score (percentage of non-null values)
    if columns:
        missing_percentages = []
        for column in columns:
            null_count = column.get("missing", 0) or 0
            missing_pct = (null_count / total_rows * 100) if total_rows > 0 else 0
            missing_percentages.append(missing_pct)
            
        avg_missing_pct = sum(missing_percentages) / len(missing_percentages) if missing_percentages else 0
        component_scores["completeness"] = max(0, 100 - avg_missing_pct)
    else:
        component_scores["completeness"] = 100  # Default if no column data
    
    # Calculate CONSISTENCY score (data type consistency)
    if columns:
        # Check if any columns have mismatched types
        string_columns = sum(1 for col in columns if col.get("type") == "string")
        date_columns = sum(1 for col in columns if col.get("type") == "date")
        numeric_columns = sum(1 for col in columns if col.get("type") in ("integer", "number", "decimal", "float"))
        other_columns = len(columns) - string_columns - date_columns - numeric_columns
        
        # Assume 90% consistency for now - if we had access to actual data, we could check values vs types
        consistency_score = 90 if other_columns == 0 else 100 - (other_columns / len(columns) * 30)
        component_scores["consistency"] = max(0, min(100, consistency_score))
    else:
        component_scores["consistency"] = 90  # Default if no column data
    
    # Calculate VALIDITY score based on column types and potential errors
    component_scores["validity"] = component_scores.get("consistency", 100) * 0.9  # Estimate based on consistency
    
    # Calculate UNIQUENESS score
    if columns:
        uniqueness_scores = []
        for column in columns:
            # Use unique values count if available
            unique_values = column.get("unique", 0) or 0
            if unique_values > 0 and total_rows > 0:
                # Calculate percentage of unique values
                uniqueness_pct = (unique_values / total_rows) * 100
                # Cap at 100% for columns where every value is unique
                uniqueness_pct = min(100, uniqueness_pct)
                uniqueness_scores.append(uniqueness_pct)
        
        # Use average uniqueness score across all columns
        avg_uniqueness = sum(uniqueness_scores) / len(uniqueness_scores) if uniqueness_scores else 80
        component_scores["uniqueness"] = avg_uniqueness
    else:
        component_scores["uniqueness"] = 80  # Default if no column data
    
    # Calculate TIMELINESS score
    if file_metadata and "created_at" in file_metadata:
        try:
            # Parse the timestamp (assuming ISO format)
            created_at_str = file_metadata["created_at"]
            if isinstance(created_at_str, str):
                if created_at_str.endswith('Z'):
                    created_at_str = created_at_str[:-1] + '+00:00'
                created_at = datetime.fromisoformat(created_at_str)
            else:
                # Assume it's already a datetime object
                created_at = datetime.now()  # Fallback
                
            # Calculate days since creation (simple approximation)
            days_since_creation = (datetime.now() - created_at).days
            # Score decreases by 5 points per day, minimum 0
            component_scores["timeliness"] = max(0, 100 - (days_since_creation * 5))
        except Exception as e:
            # Print the error for debugging
            print(f"Error calculating timeliness: {str(e)}", file=sys.stderr)
            component_scores["timeliness"] = 90  # Default if date parsing fails
    else:
        component_scores["timeliness"] = 90  # Default if no timestamp data
    
    # Calculate OVERALL score using weighted average
    overall_score = sum(component_scores.get(component, 0) * weight 
                      for component, weight in weights.items())
    
    # Round to 2 decimal places
    overall_score = round(overall_score, 2)
    component_scores = {k: round(v, 2) for k, v in component_scores.items()}
    
    # Prepare the result
    result = {
        "overall_score": overall_score,
        "components": component_scores,
        "weights": weights
    }
    
    # Write the result to the output file
    with open("${tempOutputPath}", "w") as f:
        json.dump(result, f)
        
    # Indicate success
    print("SUCCESS")
    sys.exit(0)
    
except Exception as e:
    # Handle any errors
    print(f"ERROR: {str(e)}", file=sys.stderr)
    sys.exit(1)
`
      ]);
      
      let stdoutData = '';
      let stderrData = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        try {
          // Clean up the input file
          fs.unlinkSync(tempInputPath);
          
          if (code === 0 && stdoutData.includes('SUCCESS')) {
            // Read the result from the output file
            const resultData = JSON.parse(fs.readFileSync(tempOutputPath, 'utf8'));
            
            // Clean up the output file
            fs.unlinkSync(tempOutputPath);
            
            resolve(resultData);
          } else {
            reject(new Error(`Python process exited with code ${code}: ${stderrData}`))
          }
        } catch (err) {
          reject(new Error(`Failed to process quality results: ${err.message}`));
        }
      });
    } catch (err) {
      reject(new Error(`Failed to calculate quality score: ${err.message}`));
    }
  });
}

module.exports = {
  calculateQualityScore
};
