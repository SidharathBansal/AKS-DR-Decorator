const axios = require('axios');
const flatten = require('flat');
const { readFileSync, unlinkSync, writeFileSync, appendFileSync } = require('fs');
const yaml2js  = require('js-yaml');
const path = require('path');
const { execSync } = require('child_process');

/** Console log colors */
const RED = '\x1b[31m';
const GREEN = "\x1b[32m";
const RESET = '\x1b[0m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';

const _organisation = "<DevOps Organisation Name>"
const _project = process.env.SYSTEM_TEAMPROJECT
const _pipeline_id = process.env.SYSTEM_DEFINITIONID
const _build_id = process.env.BUILD_BUILDID
const _queued_by = process.env.BUILD_QUEUEDBY
const _definition_name = process.env.BUILD_DEFINITIONNAME
const _url = `https://dev.azure.com/${_organisation}/${_project}/_apis/pipelines/${_pipeline_id}/?api-version=7.0`
const _email_url = "<API Endpoint for >"

console.log(`Project Name - ${YELLOW}${_project}${RESET}`)
console.log(`Pipeline ID - ${YELLOW}${_pipeline_id}${RESET}`)
console.log(`Build Id - ${YELLOW}${_build_id}${RESET}`);
console.log(`API URL - ${YELLOW}${_url}${RESET}`)

const config = {
    method: 'get',
    url: _url,
    headers: {
        'Authorization': 'Basic <Base 64 Encoding PAT to read Builds>'
    }
}

const Emaildata = {
  "queuedBy": _queued_by,
  "buildId": _build_id,
  "definitionName": _definition_name,
  "error": "",
  "project": _project
}

let valueFilePath, chartFilePath;
let chartPath = [], namespace = [], releaseName = [], overrideValues = [], valueFile = [];
let helmManifests, helmUpgrade;
let helmIgnore, helmIgnorePath;
let cronFileNames = [], cronPath;

const generateHelmManifest = () => {
  
  /** Edit Helm Template to get source for manifests */
  let editHelmManifest = `sed 's/# Source:/Source:/g' helmTemplate.yaml > helmTemplate1.yaml && cat helmTemplate1.yaml > helmTemplate.yaml`
  execSync(editHelmManifest);
  unlinkSync("./helmTemplate1.yaml")

  helmManifests = yaml2js.loadAll(readFileSync('helmTemplate.yaml', 'utf8'))
}

const drRequired = (pipelineKeys, currentYamlDoc_flat) => {
  if(!isk8sTask(pipelineKeys,currentYamlDoc_flat)){
    console.log(`k8s Task: ${RED}False${RESET}`)
    return false;
  }
  console.log(`k8s Task: ${GREEN}True${RESET}`)

  if(!isProdPipeline(pipelineKeys,currentYamlDoc_flat)){
    console.log(`Production Pipeline: ${RED}False${RESET}`);
    return false;
  }
  console.log(`Production Pipeline: ${GREEN}True${RESET}`)

  if(!isKindDeployment(pipelineKeys,currentYamlDoc_flat)){
    console.log(`k8s Deployment: ${RED}False${RESET}`)
    return false
  }
  console.log(`k8s Deployment: ${GREEN}True${RESET}\n`)

  return true
}

const isk8sTask = (pipelineKeys,currentYamlDoc_flat) => {
  let helmDeployExists = false
  pipelineKeys.forEach((key) => {
    if(key.includes("task")) {
      if(currentYamlDoc_flat[key].toLowerCase().includes("helmdeploy")){
        helmDeployExists = true
      };
    }
  })
  return helmDeployExists;
}

const isProdPipeline = (pipelineKeys,currentYamlDoc_flat) => {
  let prodConnectionExists = false;
  pipelineKeys.forEach((key) => {
    if(key.includes("kubernetesServiceConnection")) {
      if(currentYamlDoc_flat[key].toLowerCase().includes("prod")) {
        prodConnectionExists = true;
      }
    }
  })
  return prodConnectionExists;
}

const isKindDeployment = (pipelineKeys,currentYamlDoc_flat) => {

  pipelineKeys.forEach((key) => {
    if(key.includes("valueFile")){
      valueFilePath = currentYamlDoc_flat[key];
    }
    if(key.includes("chartPath")){
      chartFilePath = currentYamlDoc_flat[key];
    }
  })

  console.log(`Value File Path: ${GREEN}${valueFilePath}${RESET}`)
  console.log(`Chart Path: ${GREEN}${chartFilePath}${RESET}`)
  
  const helmTemplateCommand = `helm template dryrun ${chartFilePath} -f ${valueFilePath} > helmTemplate.yaml`
  execSync(helmTemplateCommand);

  generateHelmManifest()

  for(let i = 0; i < helmManifests.length; i++) {
    if(helmManifests[i] && helmManifests[i].hasOwnProperty("kind") && helmManifests[i].kind.toLowerCase() == 'deployment') {
      unlinkSync("./helmTemplate.yaml")
      return true;
    }
  }

  unlinkSync("./helmTemplate.yaml")
  return false
}

const excludeCronJobs = () => {

  helmManifests.forEach((manifest) => {
    if(manifest && manifest.hasOwnProperty("kind") && manifest.kind.toLowerCase() == 'cronjob') {
      cronPath = manifest.Source;
      const cronFileNameIndex = cronPath.lastIndexOf('/') + 1
      const cronFileName = cronPath.substring(cronFileNameIndex,cronPath.length)
      cronFileNames.push(cronFileName)
    }
  })

  helmIgnorePath = path.join(__dirname,`${chartFilePath}/.helmignore`);
  appendFileSync(helmIgnorePath, '\n')
  helmIgnore = readFileSync(helmIgnorePath, 'utf8')

  cronFileNames.forEach((cronFileName) => {
    appendFileSync(helmIgnorePath,`\n${cronFileName}`)
  })

  if(cronFileNames.length != 0) {
    console.log("Cron Jobs to Exclude from DR:");
    cronFileNames.forEach((cronFileName) => {
      console.log(`${RED}${cronFileName}${RESET}`)
    })
  }
  else {
    console.log(`${GREEN}No Cron Jobs to Exclude from DR!!${RESET}`)
  }

}

axios(config)
  .then((response) => {
    const yamlfilePath = path.join( __dirname ,response.data.configuration.path);
    console.log(`YAML File Path - ${YELLOW}${yamlfilePath}${RESET}\n`)
    let helmDeployCount = 0;
    const currentYamlDoc = yaml2js.load(readFileSync(yamlfilePath, 'utf8'));
    const currentYamlDoc_flat = flatten(currentYamlDoc)
    const pipelineKeys = Object.keys(currentYamlDoc_flat);

    console.log(`${BLUE}---------------Check if DR is Required---------------${RESET}\n`)
    if(!drRequired(pipelineKeys, currentYamlDoc_flat)) {
      console.log(`${BLUE}DR Not Required${RESET}\n`);
      process.exit(0);
    }

    console.log(`${BLUE}---------------Checking for Cron Jobs---------------${RESET}\n`)
    excludeCronJobs()

    pipelineKeys.forEach((key) => {
      /** Find Helm Deploy Task */
      if(key.includes("task")) {
        if(currentYamlDoc_flat[key].includes("HelmDeploy")){
          helmDeployCount++;
        }
      }

      key.includes("releaseName")? releaseName[helmDeployCount - 1] = currentYamlDoc_flat[key] : null
      key.includes("namespace")? namespace[helmDeployCount - 1] = currentYamlDoc_flat[key] : null

      /** Replica Count set as 0 as a temporary fix for dependencies issue*/
    
      key.includes("overrideValues")? overrideValues[helmDeployCount - 1] = `${currentYamlDoc_flat[key]},version=${_build_id},image.tag=${_build_id},minReplicas=1,maxReplicas=1,replicaCount=0,minReplicaCount=1,maxReplicaCount=1` : null
      key.includes("chartPath")? chartPath[helmDeployCount - 1] = currentYamlDoc_flat[key] : null
      key.includes("valueFile")? valueFile[helmDeployCount - 1] = currentYamlDoc_flat[key] : null    
    });
    
    for (let i = 0; i < helmDeployCount; i++) {
      namespace[i]?
        helmUpgrade = `helm upgrade --install --namespace ${namespace[i]} --values ${valueFile[i]} --set ${overrideValues[i]} --wait ${releaseName[i]} ${chartPath[i]}`
      :
        helmUpgrade = `helm upgrade --install --values ${valueFile[i]} --set ${overrideValues[i]} --wait ${releaseName[i]} ${chartPath[i]}`
      
      helmDeployCount < 2 ?
        console.log(`\n${BLUE}---------------Helm Upgrade---------------${RESET}\n`)
      :
        console.log(`\n${BLUE}---------------Helm Upgrade ${i + 1}---------------${RESET}\n`)
      
      console.log(`${YELLOW}${helmUpgrade}${RESET}\n`)
      const result = execSync(helmUpgrade)
      console.log(`${GREEN}${result}${RESET}`)
    }

    console.log(`\nHelm Deploy Count: ${GREEN}${helmDeployCount}\n${RESET}`);
    writeFileSync(helmIgnorePath, `${helmIgnore}`)
  })
  .catch(async (error) => {
    console.error(`\n${RED}${error.message}${RESET}\n`)
    helmIgnorePath && helmIgnore ? writeFileSync(helmIgnorePath, `${helmIgnore}`) : null
    Emaildata.error = error.message
    await axios.post(_email_url, Emaildata)
    process.exit(1);
  })
