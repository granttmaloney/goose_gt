# CSV Summarizer Extension for Goose

A powerful extension that provides comprehensive analysis and summarization of CSV files, including statistical insights and visualization recommendations.

## Features

- **Statistical Analysis**: Calculate min, max, mean, median, mode, and standard deviation for numeric columns
- **Data Quality Assessment**: Identify missing values, duplicate rows, and data completeness
- **Visualization Recommendations**: Suggest appropriate charts and graphs based on data characteristics
- **Multiple Output Formats**: JSON and human-readable text formats
- **Standard Library Only**: No external dependencies required

## Files Included

1. **`csv_summarizer_extension_simple.py`** - The main extension script
2. **`csv_summarizer_extension_config.json`** - Goose extension configuration
3. **`sample_data.csv`** - Sample data for testing
4. **`test_csv_summarizer.py`** - Test script to verify functionality

## Installation

### Method 1: Using the AI Extension Generator (Recommended)

1. Open Goose Desktop App
2. Go to **Settings** → **Extensions**
3. Click **"Extension Builder"**
4. Click the **"AI"** tab (first tab with sparkles icon ✨)
5. Enter this prompt: **"Create a CSV summarizer extension that reads CSV files and generates statistical summaries"**
6. Click **"Generate Extension"**

### Method 2: Manual Installation

1. Copy `csv_summarizer_extension_simple.py` to your desired location
2. In Goose, go to **Settings** → **Extensions**
3. Click **"Add custom extension"**
4. Use the configuration from `csv_summarizer_extension_config.json`:
   - **Type**: stdio
   - **Name**: csv_summarizer
   - **Command**: python3
   - **Arguments**: [path to csv_summarizer_extension_simple.py, --file]
   - **Timeout**: 30

## Usage

Once installed, you can use the extension with these tools:

### 1. `summarize_csv`
Generate a comprehensive statistical summary of a CSV file.

**Parameters:**
- `file_path` (required): Path to the CSV file
- `output_format` (optional): "json" or "text" (default: "json")
- `save_to_file` (optional): Path to save the summary

**Example:**
```json
{
  "file_path": "/path/to/your/data.csv",
  "output_format": "json"
}
```

### 2. `get_csv_info`
Get basic information about a CSV file.

**Parameters:**
- `file_path` (required): Path to the CSV file

### 3. `recommend_visualizations`
Get visualization recommendations based on data characteristics.

**Parameters:**
- `file_path` (required): Path to the CSV file

## Testing

Run the test script to verify everything works:

```bash
python3 test_csv_summarizer.py
```

This will:
1. Test JSON format output
2. Test text format output  
3. Test file saving functionality
4. Display sample results

## Sample Output

The extension provides detailed analysis including:

- **Basic Info**: Row count, column count, file size
- **Column Statistics**: Data types, missing values, unique values
- **Numeric Analysis**: Min, max, mean, median, standard deviation
- **Categorical Analysis**: Most common values, frequency counts
- **Data Quality**: Missing data assessment, duplicate detection
- **Visualization Recommendations**: Suggested chart types based on data

## Example Analysis Results

For the included `sample_data.csv`:

- **20 rows, 6 columns** (employee data)
- **Numeric columns**: age, salary, experience_years, performance_score
- **Categorical columns**: name, department
- **Recommended visualizations**: scatter_plot, histogram, bar_chart, pie_chart, etc.

## Troubleshooting

### Common Issues

1. **"No such file or directory"**: Make sure the Python script path is correct
2. **"Permission denied"**: Ensure the script has execute permissions
3. **"CSV file not found"**: Verify the file path is correct and accessible

### Dependencies

This extension uses only Python standard library modules:
- `csv` - CSV file reading
- `json` - JSON output formatting
- `statistics` - Statistical calculations
- `collections.Counter` - Frequency counting
- `pathlib` - File path handling

No external packages like pandas or numpy are required.

## Customization

You can modify the extension to:
- Add more statistical measures
- Support different file formats
- Include data validation rules
- Add custom visualization recommendations
- Implement data export functionality

## Support

If you encounter issues:
1. Check the test script output for error details
2. Verify file paths and permissions
3. Ensure Python 3.6+ is available
4. Check Goose extension logs for detailed error messages



