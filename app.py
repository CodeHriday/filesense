import streamlit as st
import pandas as pd
import os
import time
import json
import uuid
from datetime import datetime
import plotly.express as px

import file_processing
import data_profiling
import quality_checks
import db_operations
import visualization
import utils

# Set page configuration
st.set_page_config(
    page_title="Data File Observatory",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize session state variables if they don't exist
if 'current_file' not in st.session_state:
    st.session_state.current_file = None
if 'current_df' not in st.session_state:
    st.session_state.current_df = None
if 'metadata' not in st.session_state:
    st.session_state.metadata = {}
if 'quality_results' not in st.session_state:
    st.session_state.quality_results = {}
if 'history' not in st.session_state:
    st.session_state.history = []
if 'alerts' not in st.session_state:
    st.session_state.alerts = []
if 'file_catalog' not in st.session_state:
    st.session_state.file_catalog = db_operations.get_file_catalog() or []

# Create data directory if it doesn't exist
if not os.path.exists("data"):
    os.makedirs("data")
if not os.path.exists("data/uploads"):
    os.makedirs("data/uploads")

def main():
    st.title("📊 Data File Observatory")
    
    # Sidebar navigation
    st.sidebar.title("Navigation")
    page = st.sidebar.radio(
        "Select a page",
        ["Dashboard", "File Upload", "Data Profile", "Quality Checks", "Alerts Configuration", "File Catalog"]
    )
    
    # Show selected page
    if page == "Dashboard":
        show_dashboard()
    elif page == "File Upload":
        show_file_upload()
    elif page == "Data Profile":
        show_data_profile()
    elif page == "Quality Checks":
        show_quality_checks()
    elif page == "Alerts Configuration":
        show_alerts_config()
    elif page == "File Catalog":
        show_file_catalog()
    
    # Show footer
    st.sidebar.markdown("---")
    st.sidebar.info("Data File Observatory helps you monitor and maintain data quality across your files.")

def show_dashboard():
    st.header("Dashboard")
    
    if not st.session_state.file_catalog:
        st.info("Welcome to Data File Observatory! No files have been uploaded yet. Start by uploading a file in the 'File Upload' section.")
        return
    
    # File statistics overview
    st.subheader("File Statistics Overview")
    col1, col2, col3, col4 = st.columns(4)
    
    total_files = len(st.session_state.file_catalog)
    file_types = {}
    total_size = 0
    freshness = {}
    
    for file in st.session_state.file_catalog:
        file_ext = file.get('extension', 'unknown')
        file_types[file_ext] = file_types.get(file_ext, 0) + 1
        total_size += file.get('size_bytes', 0)
        days_since_update = (datetime.now() - datetime.fromisoformat(file.get('upload_time', datetime.now().isoformat()))).days
        freshness[file['file_id']] = days_since_update
    
    col1.metric("Total Files", total_files)
    col2.metric("Total Size", utils.format_size(total_size))
    
    if freshness:
        avg_freshness = sum(freshness.values()) / len(freshness)
        col3.metric("Avg. File Age (days)", f"{avg_freshness:.1f}")
    
    if file_types:
        most_common_type = max(file_types.items(), key=lambda x: x[1])[0]
        col4.metric("Most Common Type", most_common_type)
    
    # File types distribution
    if file_types:
        st.subheader("File Types Distribution")
        fig = px.pie(
            values=list(file_types.values()),
            names=list(file_types.keys()),
            title="File Types Distribution"
        )
        st.plotly_chart(fig, use_container_width=True)
    
    # Recent files
    st.subheader("Recently Uploaded Files")
    recent_files = sorted(
        st.session_state.file_catalog, 
        key=lambda x: datetime.fromisoformat(x.get('upload_time', '2000-01-01')),
        reverse=True
    )[:5]
    
    if recent_files:
        for file in recent_files:
            with st.expander(f"{file.get('filename', 'Unknown')} ({utils.format_size(file.get('size_bytes', 0))})"):
                col1, col2 = st.columns(2)
                
                col1.markdown(f"**Upload Time:** {file.get('upload_time', 'Unknown')}")
                col1.markdown(f"**File Type:** {file.get('extension', 'Unknown')}")
                col1.markdown(f"**Row Count:** {file.get('row_count', 'N/A')}")
                
                col2.markdown(f"**Columns:** {len(file.get('schema', []))}")
                if 'quality_score' in file:
                    col2.markdown(f"**Quality Score:** {file.get('quality_score', 0):.2f}/100")
                
                if st.button("View Details", key=f"view_{file['file_id']}"):
                    st.session_state.current_file = file
                    st.rerun()
    else:
        st.info("No files have been uploaded yet.")
    
    # Alert notifications
    st.subheader("Alert Notifications")
    if st.session_state.alerts:
        for i, alert in enumerate(st.session_state.alerts):
            alert_type = alert.get("type", "info")
            if alert_type == "warning":
                st.warning(f"{alert.get('timestamp', '')}: {alert.get('message', '')}")
            elif alert_type == "error":
                st.error(f"{alert.get('timestamp', '')}: {alert.get('message', '')}")
            else:
                st.info(f"{alert.get('timestamp', '')}: {alert.get('message', '')}")
    else:
        st.info("No alerts have been triggered.")

def show_file_upload():
    st.header("File Upload")
    
    # File upload
    uploaded_file = st.file_uploader(
        "Upload a data file (CSV, JSON, or Parquet)",
        type=["csv", "json", "parquet"],
        accept_multiple_files=False,
        help="Drag and drop a file or click to select"
    )
    
    if uploaded_file is not None:
        col1, col2 = st.columns(2)
        with col1:
            st.info(f"File Name: {uploaded_file.name}")
            st.info(f"File Size: {utils.format_size(uploaded_file.size)}")
        
        with col2:
            file_extension = uploaded_file.name.split('.')[-1].lower()
            if file_extension == "csv":
                delimiter = st.selectbox("CSV Delimiter", [",", ";", "|", "\t"], index=0)
            else:
                delimiter = ","
        
        if st.button("Process File"):
            with st.spinner("Processing file..."):
                # Save file to disk
                file_id = str(uuid.uuid4())
                file_path = os.path.join("data/uploads", f"{file_id}_{uploaded_file.name}")
                
                with open(file_path, "wb") as f:
                    f.write(uploaded_file.getbuffer())
                
                # Process the file
                try:
                    # Load dataframe
                    df, file_info = file_processing.load_file(file_path, file_extension, delimiter)
                    
                    # Store in session state
                    st.session_state.current_file = {
                        "file_id": file_id,
                        "filename": uploaded_file.name,
                        "extension": file_extension,
                        "size_bytes": uploaded_file.size,
                        "upload_time": datetime.now().isoformat(),
                        "file_path": file_path,
                        "delimiter": delimiter if file_extension == "csv" else None,
                        "row_count": len(df) if df is not None else 0,
                        "schema": file_info.get("schema", [])
                    }
                    
                    st.session_state.current_df = df
                    
                    # Get data profile
                    profile_results = data_profiling.profile_dataframe(df)
                    st.session_state.current_file.update({
                        "profiling": profile_results
                    })
                    
                    # Run quality checks
                    quality_results = quality_checks.run_basic_checks(df)
                    quality_score = quality_checks.calculate_quality_score(quality_results)
                    
                    st.session_state.current_file.update({
                        "quality_results": quality_results,
                        "quality_score": quality_score
                    })
                    
                    # Add to catalog
                    db_operations.add_file_to_catalog(st.session_state.current_file)
                    st.session_state.file_catalog = db_operations.get_file_catalog()
                    
                    st.success(f"File processed successfully! Quality Score: {quality_score:.2f}/100")
                    st.markdown("Go to **Data Profile** tab to see detailed information.")
                    
                except Exception as e:
                    st.error(f"Error processing file: {str(e)}")
    else:
        st.info("Drag and drop a file or click to select")

def show_data_profile():
    st.header("Data Profile")
    
    if st.session_state.current_file is None:
        st.info("No file selected. Please upload a file first or select a file from the catalog.")
        
        # Show file selection from catalog
        if st.session_state.file_catalog:
            st.subheader("Select a file from the catalog")
            file_options = {f"{file['filename']} (uploaded: {file['upload_time']})": file for file in st.session_state.file_catalog}
            selected_file_name = st.selectbox("Select a file", list(file_options.keys()))
            
            if st.button("Load Selected File"):
                selected_file = file_options[selected_file_name]
                with st.spinner("Loading file..."):
                    try:
                        file_path = selected_file["file_path"]
                        file_extension = selected_file["extension"]
                        delimiter = selected_file.get("delimiter", ",")
                        
                        # Load dataframe
                        df, _ = file_processing.load_file(file_path, file_extension, delimiter)
                        
                        # Update session state
                        st.session_state.current_file = selected_file
                        st.session_state.current_df = df
                        
                        st.success("File loaded successfully!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error loading file: {str(e)}")
        
        return
    
    # Show file metadata
    st.subheader("File Metadata")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.info(f"File Name: {st.session_state.current_file['filename']}")
        st.info(f"Size: {utils.format_size(st.session_state.current_file['size_bytes'])}")
    
    with col2:
        st.info(f"Type: {st.session_state.current_file['extension'].upper()}")
        st.info(f"Upload Time: {st.session_state.current_file['upload_time']}")
    
    with col3:
        st.info(f"Rows: {st.session_state.current_file['row_count']}")
        st.info(f"Columns: {len(st.session_state.current_file['schema'])}")
    
    # Show schema information
    st.subheader("Schema Information")
    
    schema_df = pd.DataFrame(st.session_state.current_file['schema'])
    st.dataframe(schema_df)
    
    # Show data preview
    st.subheader("Data Preview")
    if st.session_state.current_df is not None:
        st.dataframe(st.session_state.current_df.head(10))
    else:
        st.warning("Unable to display data preview")
    
    # Show profiling results
    st.subheader("Data Profiling Results")
    if "profiling" in st.session_state.current_file:
        profiling = st.session_state.current_file["profiling"]
        
        # Numeric columns summary
        if profiling["numeric_summary"] is not None:
            st.subheader("Numeric Columns Summary")
            st.dataframe(profiling["numeric_summary"])
        
        # Categorical columns summary
        if profiling["categorical_summary"] is not None and not profiling["categorical_summary"].empty:
            st.subheader("Categorical Columns Summary")
            st.dataframe(profiling["categorical_summary"])
        
        # Missing values visualization
        st.subheader("Missing Values")
        if profiling["missing_values"] is not None:
            fig = visualization.plot_missing_values(profiling["missing_values"])
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No missing values found")
        
        # Data distribution for numeric columns
        st.subheader("Data Distributions")
        if st.session_state.current_df is not None:
            numeric_cols = st.session_state.current_df.select_dtypes(include=['number']).columns.tolist()
            
            if numeric_cols:
                selected_col = st.selectbox("Select column for distribution", numeric_cols)
                fig = visualization.plot_distribution(st.session_state.current_df, selected_col)
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("No numeric columns available for distribution visualization")
    else:
        st.info("No profiling results available. Try processing the file again.")

def show_quality_checks():
    st.header("Quality Checks")
    
    if st.session_state.current_file is None:
        st.info("No file selected. Please upload a file first or select a file from the catalog.")
        return
    
    # Show quality score
    if "quality_score" in st.session_state.current_file:
        quality_score = st.session_state.current_file["quality_score"]
        
        col1, col2 = st.columns([1, 3])
        with col1:
            st.metric("Quality Score", f"{quality_score:.2f}/100")
            
            # Determine quality level
            if quality_score >= 90:
                st.success("Excellent quality")
            elif quality_score >= 70:
                st.info("Good quality")
            elif quality_score >= 50:
                st.warning("Average quality")
            else:
                st.error("Poor quality")
        
        with col2:
            # Quality score gauge chart
            fig = visualization.plot_quality_gauge(quality_score)
            st.plotly_chart(fig, use_container_width=True)
    
    # Show quality check results
    if "quality_results" in st.session_state.current_file:
        quality_results = st.session_state.current_file["quality_results"]
        
        st.subheader("Quality Check Results")
        
        # Completeness checks
        st.subheader("Completeness Checks")
        completeness_results = quality_results.get("completeness", {})
        
        if completeness_results:
            fig = visualization.plot_completeness(completeness_results)
            st.plotly_chart(fig, use_container_width=True)
            
            # Show detailed completeness results
            for col, result in completeness_results.items():
                if result["missing_pct"] > 0:
                    st.warning(f"{col}: {result['missing_pct']:.2f}% missing values ({result['missing_count']} out of {result['total_count']})")
                else:
                    st.info(f"{col}: No missing values")
        else:
            st.info("No completeness check results available")
        
        # Type validation checks
        st.subheader("Type Validation Checks")
        type_validation_results = quality_results.get("type_validation", {})
        
        if type_validation_results:
            for col, result in type_validation_results.items():
                if not result["is_valid"]:
                    st.error(f"{col}: Expected type {result['expected_type']} but found {result['detected_type']}")
                else:
                    st.info(f"{col}: Valid type ({result['expected_type']})")
        else:
            st.info("No type validation check results available")
        
        # Uniqueness checks
        st.subheader("Uniqueness Checks")
        uniqueness_results = quality_results.get("uniqueness", {})
        
        if uniqueness_results:
            for col, result in uniqueness_results.items():
                if result["duplicate_count"] > 0:
                    st.warning(f"{col}: {result['duplicate_count']} duplicate values found ({result['duplicate_pct']:.2f}%)")
                else:
                    st.info(f"{col}: No duplicates found")
        else:
            st.info("No uniqueness check results available")
        
        # Run custom quality checks
        st.subheader("Run Custom Quality Checks")
        
        custom_check_type = st.selectbox(
            "Select check type",
            ["Value Range", "Pattern Match", "Cross-column Validation"]
        )
        
        if custom_check_type == "Value Range":
            # Value range check
            numeric_cols = st.session_state.current_df.select_dtypes(include=['number']).columns.tolist()
            
            if numeric_cols:
                selected_col = st.selectbox("Select column", numeric_cols)
                min_val = st.number_input("Minimum value", value=float(st.session_state.current_df[selected_col].min()))
                max_val = st.number_input("Maximum value", value=float(st.session_state.current_df[selected_col].max()))
                
                if st.button("Run Range Check"):
                    with st.spinner("Running check..."):
                        result = quality_checks.check_value_range(st.session_state.current_df, selected_col, min_val, max_val)
                        
                        if result["out_of_range_count"] > 0:
                            st.warning(f"{result['out_of_range_count']} values are outside the range [{min_val}, {max_val}] ({result['out_of_range_pct']:.2f}%)")
                            
                            # Show examples of out-of-range values
                            out_of_range = st.session_state.current_df[
                                (st.session_state.current_df[selected_col] < min_val) | 
                                (st.session_state.current_df[selected_col] > max_val)
                            ]
                            st.dataframe(out_of_range.head(10))
                        else:
                            st.success(f"All values in {selected_col} are within the range [{min_val}, {max_val}]")
            else:
                st.info("No numeric columns available for range check")
        
        elif custom_check_type == "Pattern Match":
            # Pattern match check
            string_cols = st.session_state.current_df.select_dtypes(include=['object']).columns.tolist()
            
            if string_cols:
                selected_col = st.selectbox("Select column", string_cols)
                pattern = st.text_input("Regex pattern", value=".*")
                
                if st.button("Run Pattern Check"):
                    with st.spinner("Running check..."):
                        result = quality_checks.check_pattern_match(st.session_state.current_df, selected_col, pattern)
                        
                        if result["mismatch_count"] > 0:
                            st.warning(f"{result['mismatch_count']} values do not match the pattern '{pattern}' ({result['mismatch_pct']:.2f}%)")
                            
                            # Show examples of mismatched values
                            mismatched = result["mismatched_examples"]
                            st.write("Examples of mismatched values:")
                            for example in mismatched[:10]:
                                st.write(f"- {example}")
                        else:
                            st.success(f"All values in {selected_col} match the pattern '{pattern}'")
            else:
                st.info("No string columns available for pattern check")
        
        elif custom_check_type == "Cross-column Validation":
            # Cross-column validation
            all_cols = st.session_state.current_df.columns.tolist()
            
            if len(all_cols) >= 2:
                col1 = st.selectbox("Select first column", all_cols)
                col2 = st.selectbox("Select second column", [c for c in all_cols if c != col1])
                
                validation_type = st.selectbox(
                    "Validation type",
                    ["Equal", "First greater than second", "First less than second"]
                )
                
                if st.button("Run Cross-column Validation"):
                    with st.spinner("Running check..."):
                        result = quality_checks.check_cross_column(
                            st.session_state.current_df, 
                            col1, 
                            col2, 
                            validation_type
                        )
                        
                        if result["failure_count"] > 0:
                            st.warning(f"{result['failure_count']} rows fail the validation '{validation_type}' between {col1} and {col2} ({result['failure_pct']:.2f}%)")
                            
                            # Show examples of validation failures
                            failures = result["failure_examples"]
                            st.dataframe(failures.head(10))
                        else:
                            st.success(f"All rows pass the validation '{validation_type}' between {col1} and {col2}")
            else:
                st.info("Need at least 2 columns for cross-column validation")
    else:
        st.info("No quality check results available. Try processing the file again.")

def show_alerts_config():
    st.header("Alerts Configuration")
    
    # Display current alerts
    st.subheader("Current Alert Rules")
    
    if 'alert_rules' not in st.session_state:
        st.session_state.alert_rules = []
    
    if not st.session_state.alert_rules:
        st.info("No alert rules configured yet. Create a new rule below.")
    else:
        for i, rule in enumerate(st.session_state.alert_rules):
            with st.expander(f"Rule {i+1}: {rule['name']}"):
                st.write(f"**Type:** {rule['type']}")
                st.write(f"**Condition:** {rule['condition']}")
                st.write(f"**Threshold:** {rule['threshold']}")
                
                delete_rule = st.button("Delete Rule", key=f"delete_rule_{i}")
                if delete_rule:
                    st.session_state.alert_rules.pop(i)
                    st.rerun()
    
    # Add new alert rule
    st.subheader("Add New Alert Rule")
    
    with st.form("new_alert_rule"):
        rule_name = st.text_input("Rule Name")
        rule_type = st.selectbox(
            "Rule Type", 
            ["File Freshness", "Row Count Change", "Schema Change", "Quality Score"]
        )
        
        # Different options based on rule type
        if rule_type == "File Freshness":
            condition = "older_than"
            threshold = st.number_input("Days threshold", min_value=1, value=1)
            threshold_text = f"{threshold} days"
        
        elif rule_type == "Row Count Change":
            condition = st.selectbox("Condition", ["decrease_by", "increase_by"])
            threshold = st.number_input("Percentage", min_value=1, max_value=100, value=20)
            threshold_text = f"{threshold}%"
        
        elif rule_type == "Schema Change":
            condition = "any_change"
            threshold = "N/A"
            threshold_text = "Any schema change"
        
        elif rule_type == "Quality Score":
            condition = "below"
            threshold = st.number_input("Quality Score Threshold", min_value=0, max_value=100, value=70)
            threshold_text = f"{threshold}/100"
        
        submit_rule = st.form_submit_button("Add Rule")
        
        if submit_rule:
            if rule_name:
                new_rule = {
                    "name": rule_name,
                    "type": rule_type,
                    "condition": condition,
                    "threshold": threshold
                }
                
                st.session_state.alert_rules.append(new_rule)
                st.success(f"Alert rule added: {rule_name} - {rule_type} {condition} {threshold_text}")
                
                # Save alerts to persistent storage
                db_operations.save_alert_rules(st.session_state.alert_rules)
            else:
                st.error("Rule name is required")
    
    # Test alerts section
    st.subheader("Test Alert Rules")
    
    if st.session_state.file_catalog and st.session_state.alert_rules:
        file_options = {f"{file['filename']} (uploaded: {file['upload_time']})": file for file in st.session_state.file_catalog}
        selected_file_name = st.selectbox("Select a file to test", list(file_options.keys()))
        
        if st.button("Test Alerts on Selected File"):
            selected_file = file_options[selected_file_name]
            
            with st.spinner("Testing alerts..."):
                triggered_alerts = []
                
                for rule in st.session_state.alert_rules:
                    alert = quality_checks.check_alert(selected_file, rule)
                    
                    if alert:
                        triggered_alerts.append(alert)
                
                if triggered_alerts:
                    st.warning(f"Triggered {len(triggered_alerts)} alerts:")
                    
                    for alert in triggered_alerts:
                        st.info(f"{alert['timestamp']}: {alert['message']}")
                        
                        # Add to alerts log
                        if alert not in st.session_state.alerts:
                            st.session_state.alerts.append(alert)
                else:
                    st.success("No alerts triggered for this file")
    else:
        if not st.session_state.file_catalog:
            st.info("No files available. Upload files first.")
        
        if not st.session_state.alert_rules:
            st.info("No alert rules configured. Add rules first.")

def show_file_catalog():
    st.header("File Catalog")
    
    # Load file catalog
    if not st.session_state.file_catalog:
        st.info("No files in the catalog yet. Upload files to populate the catalog.")
        return
    
    # Filter options
    st.subheader("Filter Files")
    
    col1, col2 = st.columns(2)
    
    with col1:
        file_types = list(set(file["extension"] for file in st.session_state.file_catalog))
        selected_types = st.multiselect("File Type", file_types)
    
    with col2:
        min_date = min(datetime.fromisoformat(file["upload_time"]) for file in st.session_state.file_catalog)
        max_date = max(datetime.fromisoformat(file["upload_time"]) for file in st.session_state.file_catalog)
        
        date_range = st.date_input(
            "Upload Date Range",
            value=(min_date.date(), max_date.date()),
            min_value=min_date.date(),
            max_value=max_date.date()
        )
    
    # Apply filters
    filtered_catalog = st.session_state.file_catalog
    
    if selected_types:
        filtered_catalog = [file for file in filtered_catalog if file["extension"] in selected_types]
    
    if len(date_range) == 2:
        start_date, end_date = date_range
        filtered_catalog = [
            file for file in filtered_catalog 
            if start_date <= datetime.fromisoformat(file["upload_time"]).date() <= end_date
        ]
    
    # Display catalog
    st.subheader(f"Catalog ({len(filtered_catalog)} files)")
    
    for file in filtered_catalog:
        with st.expander(f"{file['filename']} ({utils.format_size(file['size_bytes'])})"):
            col1, col2 = st.columns(2)
            
            with col1:
                st.write(f"**File ID:** {file['file_id']}")
                st.write(f"**Upload Time:** {file['upload_time']}")
                st.write(f"**File Type:** {file['extension']}")
                st.write(f"**Size:** {utils.format_size(file['size_bytes'])}")
            
            with col2:
                st.write(f"**Rows:** {file.get('row_count', 'N/A')}")
                st.write(f"**Columns:** {len(file.get('schema', []))}")
                
                if 'quality_score' in file:
                    st.write(f"**Quality Score:** {file.get('quality_score', 0):.2f}/100")
            
            # Actions
            col1, col2, col3 = st.columns(3)
            
            with col1:
                if st.button("View Details", key=f"view_{file['file_id']}"):
                    st.session_state.current_file = file
                    
                    # Load dataframe
                    try:
                        df, _ = file_processing.load_file(
                            file["file_path"], 
                            file["extension"], 
                            file.get("delimiter", ",")
                        )
                        st.session_state.current_df = df
                    except Exception as e:
                        st.error(f"Error loading file: {str(e)}")
                    
                    st.rerun()
            
            with col2:
                if st.button("Run Quality Checks", key=f"quality_{file['file_id']}"):
                    # Load dataframe
                    try:
                        df, _ = file_processing.load_file(
                            file["file_path"], 
                            file["extension"], 
                            file.get("delimiter", ",")
                        )
                        
                        # Run quality checks
                        quality_results = quality_checks.run_basic_checks(df)
                        quality_score = quality_checks.calculate_quality_score(quality_results)
                        
                        # Update file catalog
                        file.update({
                            "quality_results": quality_results,
                            "quality_score": quality_score
                        })
                        
                        db_operations.update_file_in_catalog(file)
                        st.session_state.file_catalog = db_operations.get_file_catalog()
                        
                        st.success(f"Quality checks completed. Score: {quality_score:.2f}/100")
                    except Exception as e:
                        st.error(f"Error running quality checks: {str(e)}")
            
            with col3:
                if st.button("Delete File", key=f"delete_{file['file_id']}"):
                    if db_operations.delete_file_from_catalog(file['file_id']):
                        # Also delete the physical file
                        try:
                            if os.path.exists(file["file_path"]):
                                os.remove(file["file_path"])
                        except Exception as e:
                            st.warning(f"Error deleting file from disk: {str(e)}")
                        
                        st.session_state.file_catalog = db_operations.get_file_catalog()
                        
                        # Reset current file if it was the deleted one
                        if st.session_state.current_file and st.session_state.current_file["file_id"] == file["file_id"]:
                            st.session_state.current_file = None
                            st.session_state.current_df = None
                        
                        st.success(f"File {file['filename']} deleted from catalog")
                        st.rerun()
                    else:
                        st.error("Error deleting file from catalog")
    
    # Export catalog
    st.subheader("Export Catalog")
    
    if st.button("Export Catalog as JSON"):
        catalog_json = json.dumps(st.session_state.file_catalog, indent=2)
        st.download_button(
            label="Download JSON",
            data=catalog_json,
            file_name="file_catalog.json",
            mime="application/json"
        )

if __name__ == "__main__":
    main()
