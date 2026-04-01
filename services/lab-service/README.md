# PulseWard Lab Service Documentation

## Overview

The **Lab Service** is a crucial component of the PulseWard Hospital Management System (HMS). It is responsible for managing lab tests, processing test requests, and delivering results to both clinicians and patients. This service ensures that lab operations are efficient, accurate, and integrated with other services within the HMS.

## Features

- **Test Management**: Create, update, and delete lab tests.
- **Result Processing**: Input and manage test results.
- **Integration**: Seamlessly integrates with the patient service and clinician portal for real-time access to lab results.
- **Notifications**: Sends notifications to clinicians and patients when results are available.

## API Endpoints

The Lab Service exposes a set of RESTful APIs for interaction. Below are the key endpoints:

### 1. Create Lab Test

- **Endpoint**: `POST /api/lab/tests`
- **Description**: Create a new lab test request.
- **Request Body**:
  ```json
  {
    "patientId": "string",
    "testType": "string",
    "requestedBy": "string"
  }
  ```

### 2. Get Lab Test Results

- **Endpoint**: `GET /api/lab/tests/{testId}`
- **Description**: Retrieve results for a specific lab test.
- **Response**:
  ```json
  {
    "testId": "string",
    "results": "string",
    "status": "string"
  }
  ```

### 3. Update Lab Test Results

- **Endpoint**: `PUT /api/lab/tests/{testId}`
- **Description**: Update the results of a lab test.
- **Request Body**:
  ```json
  {
    "results": "string",
    "status": "string"
  }
  ```

## Development

### Tech Stack

- **Programming Language**: Python
- **Framework**: FastAPI
- **Database**: PostgreSQL
- **Testing**: Pytest

### Setup Instructions

1. Clone the repository:

   ```bash
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   cd PulseWard-HMS/services/lab-service
   ```

2. Create a virtual environment:

   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:

   - On Windows:
     ```bash
     .\.venv\Scripts\Activate.ps1
     ```
   - On macOS/Linux:
     ```bash
     source .venv/bin/activate
     ```

4. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Run the service:
   ```bash
   uvicorn src.main:app --reload
   ```

## Testing

To run the tests for the Lab Service, use the following command:

```bash
pytest tests/
```

## Documentation

For detailed API documentation, refer to the OpenAPI specification located in `openapi.yaml`.

## Contribution

Contributions are welcome! Please follow the standard pull request process and ensure that all tests pass before submitting.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.
