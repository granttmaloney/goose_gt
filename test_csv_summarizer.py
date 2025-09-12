#!/usr/bin/env python3
"""
Test script for the CSV Summarizer Extension
This script demonstrates how to use the CSV summarizer with the sample data.
"""

import subprocess
import json
import sys
from pathlib import Path

def test_csv_summarizer():
    """Test the CSV summarizer with sample data."""
    
    # Check if the sample CSV file exists
    csv_file = "sample_data.csv"
    if not Path(csv_file).exists():
        print(f"Error: {csv_file} not found. Please make sure the sample data file exists.")
        return False
    
    # Check if the extension script exists
    extension_script = "csv_summarizer_extension_simple.py"
    if not Path(extension_script).exists():
        print(f"Error: {extension_script} not found. Please make sure the extension script exists.")
        return False
    
    print("Testing CSV Summarizer Extension")
    print("=" * 40)
    
    try:
        # Test 1: Basic summary in JSON format
        print("\n1. Testing basic summary (JSON format):")
        result = subprocess.run([
            "python3", extension_script, 
            "--file", csv_file, 
            "--format", "json"
        ], capture_output=True, text=True, check=True)
        
        summary = json.loads(result.stdout)
        print(f"✓ Successfully analyzed {csv_file}")
        print(f"  - Rows: {summary['data_summary']['basic_info']['total_rows']}")
        print(f"  - Columns: {summary['data_summary']['basic_info']['total_columns']}")
        print(f"  - Column names: {', '.join(summary['data_summary']['basic_info']['column_names'])}")
        
        # Test 2: Text format output
        print("\n2. Testing text format output:")
        result = subprocess.run([
            "python3", extension_script, 
            "--file", csv_file, 
            "--format", "text"
        ], capture_output=True, text=True, check=True)
        
        print("✓ Text format output generated successfully")
        print("Sample output:")
        print(result.stdout[:500] + "..." if len(result.stdout) > 500 else result.stdout)
        
        # Test 3: Save to file
        print("\n3. Testing save to file:")
        output_file = "test_summary.json"
        result = subprocess.run([
            "python3", extension_script, 
            "--file", csv_file, 
            "--format", "json",
            "--output", output_file
        ], capture_output=True, text=True, check=True)
        
        if Path(output_file).exists():
            print(f"✓ Summary saved to {output_file}")
            with open(output_file, 'r') as f:
                saved_summary = json.load(f)
            print(f"  - File size: {saved_summary['file_info']['file_size_kb']} KB")
            print(f"  - Recommended visualizations: {', '.join(saved_summary['visualization_recommendations']['recommended_visualizations'])}")
        
        print("\n" + "=" * 40)
        print("✅ All tests passed! The CSV Summarizer Extension is working correctly.")
        print("\nTo use this extension in Goose:")
        print("1. Copy csv_summarizer_extension.py to your extensions directory")
        print("2. Use the configuration from csv_summarizer_extension_config.json")
        print("3. Add the extension through the Goose UI")
        
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Test failed with error: {e}")
        print(f"Error output: {e.stderr}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON output: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_csv_summarizer()
    sys.exit(0 if success else 1)
