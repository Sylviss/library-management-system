# --- Stage 1: Build React Frontend ---
FROM node:22-alpine as build-step 
WORKDIR /app-frontend
COPY ./frontend/package*.json ./    
RUN npm install
COPY ./frontend ./
RUN npm run build

# --- Stage 2: Setup Python Backend ---
FROM python:3.10-slim
WORKDIR /app-backend

# Install Dependencies
COPY ./backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend Code
COPY ./backend ./

# Copy Built Frontend Assets from Stage 1
# Note: Vite builds to 'dist' by default.
COPY --from=build-step /app-frontend/dist ./static_ui

# Run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]