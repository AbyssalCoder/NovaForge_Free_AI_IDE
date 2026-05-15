$ErrorActionPreference = "Stop"

$images = @(
  "node:22-alpine",
  "python:3.12-alpine",
  "gcc:14",
  "eclipse-temurin:21",
  "rust:1.82"
)

Write-Host "NovaForge compiler image setup"
docker --version

foreach ($image in $images) {
  Write-Host "Pulling $image ..."
  docker pull $image
}

Write-Host "Verifying compilers/interpreters ..."
docker run --rm node:22-alpine node --version
docker run --rm python:3.12-alpine python --version
docker run --rm gcc:14 gcc --version
docker run --rm gcc:14 g++ --version
docker run --rm eclipse-temurin:21 java -version
docker run --rm rust:1.82 rustc --version

Write-Host "NovaForge compiler images are ready."
