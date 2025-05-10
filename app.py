from flask import Flask, request, jsonify, render_template, url_for
import cv2
import numpy as np
import io

app = Flask(__name__)

# --- OMR Processing Logic ---
def process_omr_column(image_bytes, rect_x, rect_y, rect_width, rect_height, num_rows_for_this_column, confidence_threshold):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            app.logger.error("Could not decode image from bytes.")
            raise ValueError("Could not decode image")
    except Exception as e:
        app.logger.error(f"Error decoding image: {e}")
        raise

    x, y, w, h = int(rect_x), int(rect_y), int(rect_width), int(rect_height)
    img_h_orig, img_w_orig = img.shape[:2]
    
    x1_crop, y1_crop = max(0, x), max(0, y)
    x2_crop, y2_crop = min(img_w_orig, x + w), min(img_h_orig, y + h)
    crop_w, crop_h = x2_crop - x1_crop, y2_crop - y1_crop

    if crop_w <= 0 or crop_h <= 0:
        app.logger.warning(f"Invalid crop dimensions. w={crop_w}, h={crop_h}")
        return [] 

    column_img = img[y1_crop:y2_crop, x1_crop:x2_crop]
    if column_img.size == 0:
        app.logger.warning("Cropped column image is empty.")
        return []

    try:
        gray_column = cv2.cvtColor(column_img, cv2.COLOR_BGR2GRAY)
        blurred_column = cv2.GaussianBlur(gray_column, (5, 5), 0) 
        _, thresh_column = cv2.threshold(blurred_column, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    except cv2.error as e:
        app.logger.error(f"OpenCV error during preprocessing: {e}")
        raise ValueError(f"OpenCV error during preprocessing: {e}")

    column_h_thresh, column_w_thresh = thresh_column.shape[:2]
    if column_h_thresh == 0 or column_w_thresh == 0:
        app.logger.warning("Thresholded column image has zero dimension.")
        return []

    # Use configured number of rows
    NUM_ROWS = int(num_rows_for_this_column)
    if NUM_ROWS <= 0:
        app.logger.warning(f"Invalid number of rows: {NUM_ROWS}")
        return []
        
    NUM_BUBBLES_PER_ROW = 4 # This remains fixed as per original requirement
    row_height_approx = column_h_thresh / NUM_ROWS
    bubble_width_approx = column_w_thresh / NUM_BUBBLES_PER_ROW
    
    results_for_column = []

    for i in range(NUM_ROWS):
        bubble_scores_in_row = []

        for j in range(NUM_BUBBLES_PER_ROW):
            cell_y_start = int(i * row_height_approx)
            cell_x_start = int(j * bubble_width_approx)
            cell_y_end = int((i + 1) * row_height_approx)
            cell_x_end = int((j + 1) * bubble_width_approx)

            margin_factor = 0.20 
            margin_h = int((cell_y_end - cell_y_start) * margin_factor) 
            margin_w = int((cell_x_end - cell_x_start) * margin_factor)

            roi_y1 = max(0, cell_y_start + margin_h)
            roi_y2 = min(column_h_thresh, cell_y_end - margin_h)
            roi_x1 = max(0, cell_x_start + margin_w)
            roi_x2 = min(column_w_thresh, cell_x_end - margin_w)
            
            if roi_y2 <= roi_y1 or roi_x2 <= roi_x1:
                bubble_scores_in_row.append((0, j, None))
                continue 
            
            bubble_roi_pixels = thresh_column[roi_y1:roi_y2, roi_x1:roi_x2]
            if bubble_roi_pixels.size == 0:
                bubble_scores_in_row.append((0, j, None))
                continue

            filled_pixels_count = cv2.countNonZero(bubble_roi_pixels)
            total_pixels_in_roi = bubble_roi_pixels.shape[0] * bubble_roi_pixels.shape[1]
            
            score = 0
            if total_pixels_in_roi > 0:
                score = filled_pixels_count / total_pixels_in_roi
            
            bubble_info_for_score = { "x": roi_x1, "y": roi_y1, "w": roi_x2 - roi_x1, "h": roi_y2 - roi_y1 }
            bubble_scores_in_row.append((score, j, bubble_info_for_score))
        
        if bubble_scores_in_row:
            bubble_scores_in_row.sort(key=lambda item: item[0], reverse=True)
            best_score, best_bubble_index, best_bubble_roi_coords = bubble_scores_in_row[0]
            
            # Use configured confidence threshold
            MIN_CONFIDENCE_SCORE = float(confidence_threshold)

            row_result_for_frontend = []
            if best_score > MIN_CONFIDENCE_SCORE and best_bubble_roi_coords is not None:
                bubble_info_to_send = {
                    "label": best_bubble_index + 1,
                    "box_in_column": {
                        "x": best_bubble_roi_coords["x"], "y": best_bubble_roi_coords["y"],
                        "w": best_bubble_roi_coords["w"], "h": best_bubble_roi_coords["h"],
                        "crop_origin_w": column_w_thresh, "crop_origin_h": column_h_thresh
                    }
                }
                row_result_for_frontend.append(bubble_info_to_send)
            results_for_column.append(row_result_for_frontend)
        else:
            results_for_column.append([])
            
    return results_for_column

# --- Flask Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_column', methods=['POST'])
def handle_process_column():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No image selected"}), 400

    try:
        image_bytes = file.read()
        rect_x = float(request.form['rect_x'])
        rect_y = float(request.form['rect_y'])
        rect_width = float(request.form['rect_width'])
        rect_height = float(request.form['rect_height'])
        # Get new config parameters from the form
        num_rows = int(request.form['num_rows'])
        confidence = float(request.form['confidence_score'])

    except Exception as e:
        app.logger.error(f"Error reading form data or image: {e}")
        return jsonify({"error": f"Invalid request data: {e}"}), 400

    try:
        app.logger.info(f"Processing col: rect=({rect_x},{rect_y},{rect_width},{rect_height}), rows={num_rows}, conf={confidence}")
        column_data = process_omr_column(image_bytes, rect_x, rect_y, rect_width, rect_height, num_rows, confidence)
        return jsonify({"column_data": column_data})
    except ValueError as e: 
        app.logger.error(f"ValueError during OMR processing: {e}")
        return jsonify({"error": str(e)}), 400 
    except Exception as e:
        app.logger.error(f"Unexpected error processing OMR column: {e}", exc_info=True)
        return jsonify({"error": f"An internal server error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)