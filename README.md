# Simple OMR (Optical Mark Recognition) Web Application

This web application allows users to upload an OMR sheet image, define columns of bubbles, and have the application recognize the filled bubbles. The results are then downloadable as a text file.

## Features

*   **Image Upload:** Users can upload OMR sheet images (JPG, PNG) via drag-and-drop or file selection.
*   **Dynamic Configuration:**
    *   Number of columns per sheet.
    *   Number of rows per column.
    *   Minimum confidence threshold for bubble recognition.
*   **Interactive Column Definition:** Users draw rectangles on the uploaded image to define columns for OMR processing.
*   **Automatic Bubble Recognition:** Once a column is drawn, bubbles are automatically processed based on the "one filled bubble per row" assumption.
*   **Visual Feedback:**
    *   Drawn columns are highlighted.
    *   Detected bubbles within processed columns are visually marked.
    *   Clear status messages guide the user through the workflow.
*   **Progressive Confirmation:** Users confirm each processed column before moving to the next.
*   **Results Download:** Recognized answers are downloadable in a tab-separated `.txt` file, named after the original image.
*   **Dark Mode:** User interface supports a dark mode theme.
*   **Responsive UI:** Basic responsive design with Tailwind CSS.

## Technology Stack

*   **Frontend:**
    *   HTML5
    *   Tailwind CSS (for styling)
    *   JavaScript (for UI interactions, canvas drawing, API calls)
*   **Backend:**
    *   Python 3
    *   Flask (web framework)
    *   OpenCV (for image processing)
    *   NumPy (for numerical operations with OpenCV)

## Project Structure

    omr-web-app/
    ├── .gitignore          # Specifies intentionally untracked files that Git should ignore
    ├── app.py              # Flask backend server
    ├── requirements.txt    # Python dependencies
    ├── README.md           # This file (project overview and instructions)
    ├── static/
    │   └── script.js       # Frontend JavaScript
    └── templates/
        └── index.html      # Main HTML page


## Setup and Installation

1.  **Clone the repository (if applicable):**
    ```bash
    git clone <repository-url>
    cd omr-web-app
    ```

2.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    ```
    Activate the environment:
    *   Windows: `.\venv\Scripts\activate`
    *   macOS/Linux: `source venv/bin/activate`

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Run the Flask application:**
    ```bash
    python app.py
    ```

5.  **Access the application:**
    Open your web browser and go to `http://127.0.0.1:5000/` (or the address shown in your Flask console).

## How to Use

1.  **Upload Image:** Drag and drop an OMR sheet image onto the designated area, or click to select a file.
2.  **Configure (Optional):** Adjust the "Number of Columns," "Rows per Column," and "Min Bubble Confidence" in the left panel as needed. Configuration is typically done before drawing the first column.
3.  **Draw Column:** The application will prompt you to draw the first column. Click and drag on the displayed image to draw a rectangle around the first column of bubbles.
4.  **Automatic Processing:** Upon releasing the mouse button after drawing, the column will be automatically analyzed for filled bubbles. The drawn rectangle will turn blue, and detected bubbles will be highlighted in magenta.
5.  **Confirm Column:**
    *   If the analysis looks correct, click the "Confirm Column & Draw Next" button. The column rectangle will turn green.
    *   If you made a mistake in drawing, simply click and drag again on the canvas to redraw the *current* column. The previous (blue) analysis for that column will be discarded.
6.  **Repeat:** Continue drawing and confirming columns until all configured columns are processed. The status messages will guide you.
7.  **Download Results:** Once all columns are confirmed, the "Download All Results" button will become active. Click it to download a `.txt` file containing the recognized answers. The filename will be based on your uploaded image's name.

## Notes on OMR Sheet Design

*   The current OMR logic assumes **exactly one bubble is filled per row** within each defined column.
*   It expects **4 bubbles per row**, labeled implicitly as 1, 2, 3, 4 from left to right.
*   Clear, dark marks on the bubbles work best.
*   Ensure good contrast between the bubbles and the paper, and between filled and unfilled bubbles.

## Potential Future Enhancements

*   Support for sheets with varying numbers of bubbles per row.
*   More robust de-skewing and alignment of uploaded sheets.
*   Advanced error detection (e.g., multiple marks in a single-choice row).
*   Saving and loading of configurations.
*   User accounts and history.
