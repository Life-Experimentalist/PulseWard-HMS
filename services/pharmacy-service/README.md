# PulseWard - Pharmacy Service

## Overview

The Pharmacy Service is a crucial component of the PulseWard Hospital Management System (HMS). It is responsible for managing medication prescriptions, inventory, and interactions with patients and healthcare providers. This service ensures that medications are accurately prescribed, dispensed, and tracked throughout the patient care process.

## Features

- **Prescription Management**: Handle the creation, modification, and tracking of medication prescriptions.
- **Inventory Management**: Maintain an up-to-date inventory of medications, including stock levels and expiration dates.
- **Patient Interaction**: Facilitate communication between pharmacists and patients regarding medication usage and side effects.
- **Integration with Other Services**: Seamlessly interact with other services within the PulseWard HMS, such as the Patient Service and EHR Service.

## API Endpoints

The Pharmacy Service exposes a set of RESTful APIs for interaction with other services and applications. The API specifications can be found in the `openapi.yaml` file located in this directory.

## Development

This service is developed using [Node.js](https://nodejs.org/) and follows best practices for microservice architecture. The source code is located in the `src` directory, and tests can be found in the `tests` directory.

### Getting Started

To set up the Pharmacy Service locally, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   cd PulseWard-HMS/services/pharmacy-service
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Start the service:

   ```
   npm start
   ```

4. Run tests:
   ```
   npm test
   ```

## Documentation

Comprehensive documentation for the Pharmacy Service, including API details and usage examples, can be found in the `docs` directory of the PulseWard HMS project.

## Contribution

Contributions to the Pharmacy Service are welcome! Please refer to the project's main README for guidelines on contributing.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.
