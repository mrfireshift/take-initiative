import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseAst } from "rollup/parseAst";

// The tracker is mounted by one long function (mountInitiativeList) whose body runs top to bottom. A const or let of
// that body read before its line throws "Cannot access … before initialization": the mount stops and the tracker
// shows no card. The unit tests extract functions from the source and never run the whole mount, so this check walks
// the body in execution order: every statement, and every function of the body it calls at once (not the callbacks it
// only registers), must not read a binding declared further down.
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const ast = parseAst(source);

function findMount(node) {
  for (const statement of node.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "FunctionDeclaration" && declaration.id?.name === "mountInitiativeList") return declaration;
  }
  return null;
}

const FUNCTION_TYPES = new Set(["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"]);

function children(node) {
  const result = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    if (Array.isArray(value)) result.push(...value.filter((entry) => entry && typeof entry.type === "string"));
    else if (value && typeof value.type === "string") result.push(value);
  }
  return result;
}

// Identifiers read while a node runs, without entering nested functions; the functions it calls by name are listed.
function synchronousReads(node, reads = [], calls = []) {
  if (!node || FUNCTION_TYPES.has(node.type)) return { reads, calls };
  if (node.type === "Identifier") reads.push(node);
  if (node.type === "VariableDeclarator") {
    synchronousReads(node.init, reads, calls);
    return { reads, calls };
  }
  if (node.type === "MemberExpression" && !node.computed) {
    synchronousReads(node.object, reads, calls);
    return { reads, calls };
  }
  if (node.type === "Property" && !node.computed && !node.shorthand) {
    synchronousReads(node.value, reads, calls);
    return { reads, calls };
  }
  if (node.type === "CallExpression" && node.callee.type === "Identifier") calls.push(node.callee.name);
  for (const child of children(node)) synchronousReads(child, reads, calls);
  return { reads, calls };
}

test("il montaggio del tracker non legge nessuna const o let prima della sua dichiarazione", () => {
  const mount = findMount(ast);
  assert.ok(mount, "mountInitiativeList not found");
  const body = mount.body.body;

  // The body's own bindings: the statement index where each const/let becomes readable, and its functions.
  const declaredAt = new Map();
  const functions = new Map();
  body.forEach((statement, index) => {
    if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
      for (const declarator of statement.declarations) {
        if (declarator.id.type === "Identifier") declaredAt.set(declarator.id.name, index);
        if (declarator.id.type === "Identifier" && FUNCTION_TYPES.has(declarator.init?.type)) functions.set(declarator.id.name, declarator.init);
      }
    }
    if (statement.type === "FunctionDeclaration" && statement.id) functions.set(statement.id.name, statement);
  });

  const problems = [];
  const lineOf = (offset) => source.slice(0, offset).split("\n").length;
  body.forEach((statement, index) => {
    const visited = new Set();
    // A function declared in the body runs only when called: followed from its calls below, never by itself.
    const pending = statement.type === "FunctionDeclaration" ? [] : [{ node: statement, via: "" }];
    while (pending.length) {
      const { node, via } = pending.pop();
      const { reads, calls } = synchronousReads(node);
      for (const identifier of reads) {
        const at = declaredAt.get(identifier.name);
        // Read at or before its own declaration (its initializer reading itself counts too).
        if (at !== undefined && (at > index || (at === index && identifier.start < statement.declarations?.[0]?.init?.start)))
          problems.push(`${identifier.name} letto alla riga ${lineOf(identifier.start)}${via} prima della dichiarazione (riga ${lineOf(body[at].start)})`);
      }
      for (const name of calls) {
        const fn = functions.get(name);
        if (!fn || visited.has(name)) continue;
        visited.add(name);
        pending.push({ node: fn.body, via: `${via} via ${name}()` });
      }
    }
  });
  assert.deepEqual(problems, []);
});
