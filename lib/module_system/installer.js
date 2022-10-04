"use strict";
/*
Copyright 2022 New Vector Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installer = void 0;
const fs = __importStar(require("fs"));
const childProcess = __importStar(require("child_process"));
const semver = __importStar(require("semver"));
// This expects to be run from ./scripts/install.ts
const moduleApiDepName = "@matrix-org/react-sdk-module-api";
const MODULES_TS_HEADER = `
/*
 * THIS FILE IS AUTO-GENERATED
 * You can edit it you like, but your changes will be overwritten,
 * so you'd just be trying to swim upstream like a salmon.
 * You are not a salmon.
 */

import { RuntimeModule } from "@matrix-org/react-sdk-module-api/lib/RuntimeModule";
`;
const MODULES_TS_DEFINITIONS = `
export const INSTALLED_MODULES: RuntimeModule[] = [];
`;
function installer(config) {
    var _a;
    if (!((_a = config.modules) === null || _a === void 0 ? void 0 : _a.length)) {
        // nothing to do
        writeModulesTs(MODULES_TS_HEADER + MODULES_TS_DEFINITIONS);
        return;
    }
    let exitCode = 0;
    // We cheat a bit and store the current package.json and lockfile so we can safely
    // run `yarn add` without creating extra committed files for people. We restore
    // these files by simply overwriting them when we're done.
    const packageDeps = readCurrentPackageDetails();
    // Record which optional dependencies there are currently, if any, so we can exclude
    // them from our "must be a module" assumption later on.
    const currentOptDeps = getOptionalDepNames(packageDeps.packageJson);
    try {
        // Install the modules with yarn
        const yarnAddRef = config.modules.join(" ");
        callYarnAdd(yarnAddRef); // install them all at once
        // Grab the optional dependencies again and exclude what was there already. Everything
        // else must be a module, we assume.
        const pkgJsonStr = fs.readFileSync("./package.json", "utf-8");
        const optionalDepNames = getOptionalDepNames(pkgJsonStr);
        const installedModules = optionalDepNames.filter(d => !currentOptDeps.includes(d));
        // Ensure all the modules are compatible. We check them all and report at the end to
        // try and save the user some time debugging this sort of failure.
        const ourApiVersion = getTopLevelDependencyVersion(moduleApiDepName);
        const incompatibleNames = [];
        for (const moduleName of installedModules) {
            const modApiVersion = getModuleApiVersionFor(moduleName);
            if (!isModuleVersionCompatible(ourApiVersion, modApiVersion)) {
                incompatibleNames.push(moduleName);
            }
        }
        if (incompatibleNames.length > 0) {
            console.error("The following modules are not compatible with this version of element-web. Please update the module " +
                "references and try again.", JSON.stringify(incompatibleNames, null, 4));
            exitCode = 1;
            return; // hit the finally{} block before exiting
        }
        // If we reach here, everything seems fine. Write modules.ts and log some output
        // Note: we compile modules.ts in two parts for developer friendliness if they
        // happen to look at it.
        console.log("The following modules have been installed: ", installedModules);
        let modulesTsHeader = MODULES_TS_HEADER;
        let modulesTsDefs = MODULES_TS_DEFINITIONS;
        let index = 0;
        for (const moduleName of installedModules) {
            const importName = `Module${++index}`;
            modulesTsHeader += `import ${importName} from "${moduleName}";\n`;
            modulesTsDefs += `INSTALLED_MODULES.push(${importName});\n`;
        }
        writeModulesTs(modulesTsHeader + modulesTsDefs);
        console.log("Done installing modules");
    }
    finally {
        // Always restore package details (or at least try to)
        writePackageDetails(packageDeps);
        if (exitCode > 0) {
            process.exit(exitCode);
        }
    }
}
exports.installer = installer;
function readCurrentPackageDetails() {
    return {
        lockfile: fs.readFileSync("./yarn.lock", "utf-8"),
        packageJson: fs.readFileSync("./package.json", "utf-8"),
    };
}
function writePackageDetails(deps) {
    fs.writeFileSync("./yarn.lock", deps.lockfile, "utf-8");
    fs.writeFileSync("./package.json", deps.packageJson, "utf-8");
}
function callYarnAdd(dep) {
    // Add the module to the optional dependencies section just in case something
    // goes wrong in restoring the original package details.
    childProcess.execSync(`yarn add -O ${dep}`, {
        env: process.env,
        stdio: ['inherit', 'inherit', 'inherit'],
    });
}
function getOptionalDepNames(pkgJsonStr) {
    var _a, _b;
    return Object.keys((_b = (_a = JSON.parse(pkgJsonStr)) === null || _a === void 0 ? void 0 : _a['optionalDependencies']) !== null && _b !== void 0 ? _b : {});
}
function findDepVersionInPackageJson(dep, pkgJsonStr) {
    var _a, _b, _c;
    const pkgJson = JSON.parse(pkgJsonStr);
    const packages = Object.assign(Object.assign(Object.assign({}, ((_a = pkgJson['optionalDependencies']) !== null && _a !== void 0 ? _a : {})), ((_b = pkgJson['devDependencies']) !== null && _b !== void 0 ? _b : {})), ((_c = pkgJson['dependencies']) !== null && _c !== void 0 ? _c : {}));
    return packages[dep];
}
function getTopLevelDependencyVersion(dep) {
    const dependencyTree = JSON.parse(childProcess.execSync(`npm list ${dep} --depth=0 --json`, {
        env: process.env,
        stdio: ['inherit', 'pipe', 'pipe'],
    }).toString('utf-8'));
    /*
        What a dependency tree looks like:
        {
          "version": "1.10.13",
          "name": "element-web",
          "dependencies": {
            "@matrix-org/react-sdk-module-api": {
              "version": "0.0.1",
              "resolved": "file:../../../matrix-react-sdk-module-api"
            }
          }
        }
     */
    return dependencyTree["dependencies"][dep]["version"];
}
function getModuleApiVersionFor(moduleName) {
    // We'll just pretend that this isn't highly problematic...
    // Yarn is fairly stable in putting modules in a flat hierarchy, at least.
    const pkgJsonStr = fs.readFileSync(`./node_modules/${moduleName}/package.json`, "utf-8");
    return findDepVersionInPackageJson(moduleApiDepName, pkgJsonStr);
}
function isModuleVersionCompatible(ourApiVersion, moduleApiVersion) {
    if (!moduleApiVersion)
        return false;
    return semver.satisfies(ourApiVersion, moduleApiVersion);
}
function writeModulesTs(content) {
    fs.writeFileSync("./src/modules.ts", content, "utf-8");
}
