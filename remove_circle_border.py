from PIL import Image
import numpy as np

# Load the image
img = Image.open('public/logo.png').convert('RGBA')
width, height = img.size
data = np.array(img)

# Find the center and radius of the circle
center_x, center_y = width // 2, height // 2
radius = min(width, height) // 2

# Create a mask for pixels that are likely part of the border
# We'll look for pixels that are on or near the circle edge and have a light color
border_thickness = 2  # pixels
border_color_threshold = 200  # Light colors (beige/pale yellow)

# Create a new image with alpha channel
result = data.copy()

# Find and remove the circular border
for y in range(height):
    for x in range(width):
        # Calculate distance from center
        dx = x - center_x
        dy = y - center_y
        distance = np.sqrt(dx*dx + dy*dy)
        
        # Check if pixel is near the circle edge
        if abs(distance - radius) <= border_thickness:
            # Check if pixel is light colored (likely the border)
            r, g, b, a = data[y, x]
            if r > border_color_threshold and g > border_color_threshold and b > border_color_threshold:
                # Make it transparent
                result[y, x] = [0, 0, 0, 0]

# Also remove any remaining light-colored border pixels
for y in range(height):
    for x in range(width):
        r, g, b, a = data[y, x]
        # If pixel is very light and near the edge, make it transparent
        if (r > 200 and g > 200 and b > 200) or (r > 180 and g > 180 and b > 180 and a < 255):
            dx = x - center_x
            dy = y - center_y
            distance = np.sqrt(dx*dx + dy*dy)
            if distance > radius * 0.85:  # Near the edge
                result[y, x] = [0, 0, 0, 0]

# Save the result
result_img = Image.fromarray(result)
result_img.save('public/logo.png', 'PNG')
print("Circle border removed successfully!")
