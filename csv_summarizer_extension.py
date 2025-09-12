#!/usr/bin/env python3
"""
CSV Summarizer Extension for Goose
This extension provides tools to read CSV files and generate statistical summaries.
"""

import pandas as pd
import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
import argparse

def read_csv_file(file_path: str) -> pd.DataFrame:
    """Read a CSV file and return a pandas DataFrame."""
    try:
        df = pd.read_csv(file_path)
        return df
    except Exception as e:
        raise Exception(f"Error reading CSV file: {str(e)}")

def generate_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """Generate a comprehensive summary of the CSV data."""
    summary = {
        "basic_info": {
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "column_names": df.columns.tolist(),
            "memory_usage": f"{df.memory_usage(deep=True).sum() / 1024:.2f} KB"
        },
        "data_types": df.dtypes.astype(str).to_dict(),
        "missing_values": df.isnull().sum().to_dict(),
        "statistical_summary": {}
    }
    
    # Generate statistical summary for numeric columns
    numeric_columns = df.select_dtypes(include=['number']).columns
    if len(numeric_columns) > 0:
        summary["statistical_summary"] = df[numeric_columns].describe().to_dict()
    
    # Generate summary for categorical columns
    categorical_columns = df.select_dtypes(include=['object', 'category']).columns
    if len(categorical_columns) > 0:
        summary["categorical_summary"] = {}
        for col in categorical_columns:
            summary["categorical_summary"][col] = {
                "unique_values": df[col].nunique(),
                "most_common": df[col].value_counts().head(5).to_dict(),
                "sample_values": df[col].dropna().head(3).tolist()
            }
    
    return summary

def create_visualization_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """Create a summary suitable for visualization recommendations."""
    viz_summary = {
        "recommended_visualizations": [],
        "data_characteristics": {}
    }
    
    numeric_columns = df.select_dtypes(include=['number']).columns
    categorical_columns = df.select_dtypes(include=['object', 'category']).columns
    
    # Recommend visualizations based on data characteristics
    if len(numeric_columns) >= 2:
        viz_summary["recommended_visualizations"].append("scatter_plot")
        viz_summary["recommended_visualizations"].append("correlation_heatmap")
    
    if len(numeric_columns) >= 1:
        viz_summary["recommended_visualizations"].append("histogram")
        viz_summary["recommended_visualizations"].append("box_plot")
    
    if len(categorical_columns) >= 1:
        viz_summary["recommended_visualizations"].append("bar_chart")
        viz_summary["recommended_visualizations"].append("pie_chart")
    
    if len(numeric_columns) >= 1 and len(categorical_columns) >= 1:
        viz_summary["recommended_visualizations"].append("grouped_bar_chart")
    
    # Data characteristics
    viz_summary["data_characteristics"] = {
        "has_numeric_data": len(numeric_columns) > 0,
        "has_categorical_data": len(categorical_columns) > 0,
        "numeric_columns": numeric_columns.tolist(),
        "categorical_columns": categorical_columns.tolist(),
        "data_size": "small" if len(df) < 1000 else "medium" if len(df) < 10000 else "large"
    }
    
    return viz_summary

def main():
    """Main function to handle command line arguments and execute the summarization."""
    parser = argparse.ArgumentParser(description="CSV Summarizer Extension")
    parser.add_argument("--file", required=True, help="Path to the CSV file to summarize")
    parser.add_argument("--output", help="Path to save the summary JSON file")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format")
    
    args = parser.parse_args()
    
    try:
        # Read the CSV file
        df = read_csv_file(args.file)
        
        # Generate summary
        summary = generate_summary(df)
        viz_summary = create_visualization_summary(df)
        
        # Combine summaries
        full_summary = {
            "file_info": {
                "file_path": args.file,
                "file_size": f"{Path(args.file).stat().st_size / 1024:.2f} KB"
            },
            "data_summary": summary,
            "visualization_recommendations": viz_summary
        }
        
        # Output the summary
        if args.format == "json":
            output = json.dumps(full_summary, indent=2, default=str)
        else:
            # Text format
            output = f"""
CSV File Summary: {args.file}
{'='*50}

Basic Information:
- Total Rows: {summary['basic_info']['total_rows']}
- Total Columns: {summary['basic_info']['total_columns']}
- Memory Usage: {summary['basic_info']['memory_usage']}

Columns: {', '.join(summary['basic_info']['column_names'])}

Data Types:
{chr(10).join([f"- {col}: {dtype}" for col, dtype in summary['data_types'].items()])}

Missing Values:
{chr(10).join([f"- {col}: {count}" for col, count in summary['missing_values'].items() if count > 0])}

Recommended Visualizations:
{', '.join(viz_summary['recommended_visualizations'])}
"""
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            print(f"Summary saved to {args.output}")
        else:
            print(output)
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()



