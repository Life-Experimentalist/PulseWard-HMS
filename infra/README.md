# PulseWard Infrastructure Documentation

## Overview

The **PulseWard Hospital Management System (HMS)** is designed to streamline hospital operations, enhance patient care, and improve administrative efficiency. This document provides an overview of the infrastructure setup required to deploy and manage the PulseWard HMS.

## Infrastructure Components

### 1. Docker

Docker is used to containerize the applications and services, ensuring consistency across different environments. The Docker configurations are located in the `infra/docker` directory.

### 2. AWS Runtime (Primary)

AWS is the primary runtime target for production deployment.

Recommended baseline:

- ECS Fargate for containerized services
- RDS PostgreSQL for transactional data
- ElastiCache Redis for cache/queues/locks
- S3 for object storage

### 3. Cloudflare Edge Layer (Primary)

Cloudflare is used for CDN, WAF, TLS termination, and request protection. Cloudflare Workers can be used for lightweight edge logic.

### 4. Kubernetes (Optional, Later)

Kubernetes orchestrates containerized workloads at larger scale and operational complexity. The Kubernetes configurations can be found in the `infra/kubernetes` directory.

### 5. Terraform (Optional, Later)

Terraform can be introduced when infrastructure repeatability across environments requires IaC automation at scale. Terraform configurations are located in `infra/terraform`.

## Setup Instructions

1. **Docker Setup**

   - Ensure Docker is installed on your machine.
   - Navigate to the `infra/docker` directory and build the Docker images using the provided Dockerfiles.
   - Run the containers using Docker Compose.

2. **Primary Deployment Path (AWS + Cloudflare)**

   - Build and push Docker images.
   - Deploy services to ECS Fargate.
   - Provision PostgreSQL (RDS), Redis (ElastiCache), and storage (S3).
   - Route traffic through Cloudflare.

3. **Optional Kubernetes Deployment**

   - Ensure you have access to a Kubernetes cluster.
   - Apply the configurations in `infra/kubernetes`.

4. **Optional Terraform Provisioning**
   - Install Terraform on your machine.
   - Navigate to `infra/terraform`, initialize, and apply configurations.

## Conclusion

This infrastructure approach is designed to be practical now and scalable later: start with Docker + AWS + Cloudflare, then introduce Kubernetes/Terraform only when operational complexity justifies it.
