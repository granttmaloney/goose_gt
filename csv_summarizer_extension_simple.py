#!/usr/bin/env python3
"""
CSV Summarizer Extension for Goose (Standard Library Version)
This extension provides tools to read CSV files and generate statistical summaries using only Python standard library.
"""

import csv
import json
import sys
import statistics
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import argparse
from collections import Counter

def read_csv_file(file_path: str) -> List[Dict[str, str]]:
    """Read a CSV file and return a list of dictionaries."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            return list(reader)
    except Exception as e:
        raise Exception(f"Error reading CSV file: {str(e)}")

def is_numeric(value: str) -> bool:
    """Check if a string value can be converted to a number."""
    try:
        float(value)
        return True
    except ValueError:
        return False

def convert_to_numeric(value: str) -> Union[float, str]:
    """Convert string to numeric if possible, otherwise return as string."""
    try:
        if '.' in value:
            return float(value)
        else:
            return int(value)
    except ValueError:
        return value

def get_column_stats(data: List[Dict[str, str]], column: str) -> Dict[str, Any]:
    """Get statistical information for a column."""
    values = [row[column] for row in data if row[column].strip()]
    numeric_values = [convert_to_numeric(v) for v in values if is_numeric(v)]
    
    stats = {
        "total_values": len(values),
        "non_empty_values": len([v for v in values if v.strip()]),
        "empty_values": len([v for v in values if not v.strip()]),
        "unique_values": len(set(values)),
        "is_numeric": len(numeric_values) > 0,
        "sample_values": values[:5]
    }
    
    if numeric_values:
        stats.update({
            "min": min(numeric_values),
            "max": max(numeric_values),
            "mean": statistics.mean(numeric_values),
            "median": statistics.median(numeric_values),
            "mode": statistics.mode(numeric_values) if len(set(numeric_values)) < len(numeric_values) else None,
            "std_dev": statistics.stdev(numeric_values) if len(numeric_values) > 1 else 0
        })
    else:
        # For non-numeric columns, get frequency counts
        value_counts = Counter(values)
        stats["most_common"] = dict(value_counts.most_common(5))
    
    return stats

def generate_summary(data: List[Dict[str, str]]) -> Dict[str, Any]:
    """Generate a comprehensive summary of the CSV data."""
    if not data:
        return {"error": "No data found in CSV file"}
    
    columns = list(data[0].keys())
    
    summary = {
        "basic_info": {
            "total_rows": len(data),
            "total_columns": len(columns),
            "column_names": columns,
            "file_size_kb": 0  # Will be set by caller
        },
        "column_statistics": {},
        "data_quality": {
            "columns_with_missing_data": [],
            "columns_with_all_data": [],
            "duplicate_rows": 0
        }
    }
    
    # Analyze each column
    for column in columns:
        summary["column_statistics"][column] = get_column_stats(data, column)
        
        # Check for missing data
        non_empty_count = summary["column_statistics"][column]["non_empty_values"]
        if non_empty_count < len(data):
            summary["data_quality"]["columns_with_missing_data"].append({
                "column": column,
                "missing_count": len(data) - non_empty_count,
                "missing_percentage": round((len(data) - non_empty_count) / len(data) * 100, 2)
            })
        else:
            summary["data_quality"]["columns_with_all_data"].append(column)
    
    # Check for duplicate rows
    unique_rows = set()
    for row in data:
        row_tuple = tuple(row.values())
        if row_tuple in unique_rows:
            summary["data_quality"]["duplicate_rows"] += 1
        else:
            unique_rows.add(row_tuple)
    
    return summary

def create_visualization_recommendations(data: List[Dict[str, str]]) -> Dict[str, Any]:
    """Create visualization recommendations based on data characteristics."""
    if not data:
        return {"error": "No data found"}
    
    columns = list(data[0].keys())
    numeric_columns = []
    categorical_columns = []
    
    # Categorize columns
    for column in columns:
        values = [row[column] for row in data if row[column].strip()]
        if values and all(is_numeric(v) for v in values[:10]):  # Check first 10 values
            numeric_columns.append(column)
        else:
            categorical_columns.append(column)
    
    recommendations = {
        "recommended_visualizations": [],
        "data_characteristics": {
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "data_size": "small" if len(data) < 1000 else "medium" if len(data) < 10000 else "large"
        }
    }
    
    # Generate recommendations
    if len(numeric_columns) >= 2:
        recommendations["recommended_visualizations"].extend([
            "scatter_plot",
            "correlation_matrix"
        ])
    
    if len(numeric_columns) >= 1:
        recommendations["recommended_visualizations"].extend([
            "histogram",
            "box_plot",
            "line_chart"
        ])
    
    if len(categorical_columns) >= 1:
        recommendations["recommended_visualizations"].extend([
            "bar_chart",
            "pie_chart"
        ])
    
    if len(numeric_columns) >= 1 and len(categorical_columns) >= 1:
        recommendations["recommended_visualizations"].append("grouped_bar_chart")
    
    return recommendations

def main():
    """Main function to handle command line arguments and execute the summarization."""
    parser = argparse.ArgumentParser(description="CSV Summarizer Extension (Standard Library)")
    parser.add_argument("--file", required=True, help="Path to the CSV file to summarize")
    parser.add_argument("--output", help="Path to save the summary JSON file")
    parser.add_argument("--format", choices=["json", "text"], default="json", help="Output format")
    
    args = parser.parse_args()
    
    try:
        # Read the CSV file
        data = read_csv_file(args.file)
        
        # Get file size
        file_size_kb = Path(args.file).stat().st_size / 1024
        
        # Generate summary
        summary = generate_summary(data)
        if "error" in summary:
            print(f"Error: {summary['error']}", file=sys.stderr)
            sys.exit(1)
        
        # Add file size to summary
        summary["basic_info"]["file_size_kb"] = round(file_size_kb, 2)
        
        # Generate visualization recommendations
        viz_recommendations = create_visualization_recommendations(data)
        
        # Combine summaries
        full_summary = {
            "file_info": {
                "file_path": args.file,
                "file_size_kb": round(file_size_kb, 2)
            },
            "data_summary": summary,
            "visualization_recommendations": viz_recommendations
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
- File Size: {summary['basic_info']['file_size_kb']} KB

Columns: {', '.join(summary['basic_info']['column_names'])}

Column Statistics:
"""
            for col, stats in summary['column_statistics'].items():
                output += f"\n{col}:"
                output += f"\n  - Total values: {stats['total_values']}"
                output += f"\n  - Non-empty values: {stats['non_empty_values']}"
                output += f"\n  - Unique values: {stats['unique_values']}"
                if stats['is_numeric']:
                    output += f"\n  - Min: {stats['min']}"
                    output += f"\n  - Max: {stats['max']}"
                    output += f"\n  - Mean: {stats['mean']:.2f}"
                    output += f"\n  - Median: {stats['median']:.2f}"
                else:
                    output += f"\n  - Most common: {list(stats['most_common'].keys())[:3]}"
            
            output += f"\n\nData Quality:"
            if summary['data_quality']['columns_with_missing_data']:
                output += f"\n- Columns with missing data: {len(summary['data_quality']['columns_with_missing_data'])}"
            else:
                output += f"\n- All columns have complete data"
            
            output += f"\n- Duplicate rows: {summary['data_quality']['duplicate_rows']}"
            
            output += f"\n\nRecommended Visualizations:"
            output += f"\n{', '.join(viz_recommendations['recommended_visualizations'])}"
        
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



