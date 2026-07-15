# AKS-DR-Decorator

Install Packages in Package.json - `npm i`

Create a rollup build of the script to avoid any version dependencies - `rollup -c`

Language: JavaScript
Platform: Azure DevOps / Azure Pipelines
Key Dependencies: Axios, js-yaml, Rollup, pkg, tfx-cli

What it does:

Runs as a post-task decorator in Azure Pipelines
Fetches pipeline YAML configuration via Azure DevOps REST API
Validates if DR deployment is needed (checks for Helm, production AKS connection, Deployment kind)
Generates Helm templates and excludes CronJobs
Executes helm upgrade --install with build-specific tags and replicas
Handles cleanup and error notifications
Build & Publish:

Build: npm run build (creates Rollup bundle)
Publish to Marketplace: npm run publish (requires DevOps PAT token)
