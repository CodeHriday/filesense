import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

def plot_missing_values(missing_values):
    """
    Create a bar chart of missing values by column.
    
    Args:
        missing_values (dict): Dictionary of missing value stats by column
    
    Returns:
        plotly.graph_objects.Figure: Plotly figure
    """
    if not missing_values:
        return go.Figure()
    
    columns = list(missing_values.keys())
    percentages = [missing_values[col]["percentage"] for col in columns]
    
    fig = px.bar(
        x=columns,
        y=percentages,
        labels={"x": "Column", "y": "Missing (%)"},
        title="Missing Values by Column",
        text=percentages,
        color=percentages,
        color_continuous_scale="Viridis"
    )
    
    fig.update_traces(texttemplate="%{text:.1f}%", textposition="outside")
    fig.update_layout(yaxis_range=[0, 100])
    
    return fig

def plot_distribution(df, column):
    """
    Create a histogram of a column's distribution.
    
    Args:
        df (pandas.DataFrame): DataFrame
        column (str): Column name
    
    Returns:
        plotly.graph_objects.Figure: Plotly figure
    """
    if column not in df.columns:
        return go.Figure()
    
    # Histogram for numeric data
    if pd.api.types.is_numeric_dtype(df[column]):
        fig = px.histogram(
            df,
            x=column,
            title=f"Distribution of {column}",
            marginal="box",
            color_discrete_sequence=["#636EFA"]
        )
    # Bar chart for categorical data
    else:
        value_counts = df[column].value_counts().reset_index()
        value_counts.columns = ["value", "count"]
        
        if len(value_counts) > 20:
            # If there are too many categories, show only the top 20
            value_counts = value_counts.head(20)
        
        fig = px.bar(
            value_counts,
            x="value",
            y="count",
            title=f"Distribution of {column} (Top 20 Values)",
            labels={"value": column, "count": "Count"},
            color_discrete_sequence=["#636EFA"]
        )
        
        # Rotate x-axis labels if there are many categories
        if len(value_counts) > 5:
            fig.update_layout(xaxis_tickangle=-45)
    
    return fig

def plot_quality_gauge(score):
    """
    Create a gauge chart for quality score.
    
    Args:
        score (float): Quality score (0-100)
    
    Returns:
        plotly.graph_objects.Figure: Plotly figure
    """
    # Define quality levels and colors
    levels = [
        (0, 50, "Poor", "red"),
        (50, 70, "Average", "orange"),
        (70, 90, "Good", "lightgreen"),
        (90, 100, "Excellent", "green")
    ]
    
    # Find current level
    current_level = None
    current_color = "gray"
    for level in levels:
        if level[0] <= score <= level[1]:
            current_level = level[2]
            current_color = level[3]
            break
    
    # Create gauge chart
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=score,
        domain={"x": [0, 1], "y": [0, 1]},
        title={"text": f"Quality Score: {current_level}"},
        gauge={
            "axis": {"range": [0, 100]},
            "bar": {"color": current_color},
            "steps": [
                {"range": [0, 50], "color": "lightgray"},
                {"range": [50, 70], "color": "lightgray"},
                {"range": [70, 90], "color": "lightgray"},
                {"range": [90, 100], "color": "lightgray"}
            ]
        }
    ))
    
    return fig

def plot_completeness(completeness_results):
    """
    Create a bar chart of completeness by column.
    
    Args:
        completeness_results (dict): Dictionary of completeness results by column
    
    Returns:
        plotly.graph_objects.Figure: Plotly figure
    """
    if not completeness_results:
        return go.Figure()
    
    columns = list(completeness_results.keys())
    missing_pcts = [completeness_results[col]["missing_pct"] for col in columns]
    completeness_pcts = [100 - pct for pct in missing_pcts]
    
    fig = px.bar(
        x=columns,
        y=completeness_pcts,
        labels={"x": "Column", "y": "Completeness (%)"},
        title="Completeness by Column",
        text=completeness_pcts,
        color=completeness_pcts,
        color_continuous_scale="Viridis"
    )
    
    fig.update_traces(texttemplate="%{text:.1f}%", textposition="outside")
    fig.update_layout(yaxis_range=[0, 100])
    
    return fig

def plot_history(history_data, metric):
    """
    Create a line chart showing a metric over time.
    
    Args:
        history_data (list): List of historical data points
        metric (str): Metric to plot
    
    Returns:
        plotly.graph_objects.Figure: Plotly figure
    """
    if not history_data or metric not in history_data[0]:
        return go.Figure()
    
    timestamps = [point.get("snapshot_time", "") for point in history_data]
    values = [point.get(metric, 0) for point in history_data]
    
    fig = px.line(
        x=timestamps,
        y=values,
        labels={"x": "Time", "y": metric.replace("_", " ").title()},
        title=f"{metric.replace('_', ' ').title()} Over Time",
        markers=True
    )
    
    return fig
