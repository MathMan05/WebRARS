import {instructions, registerNames} from "../fetches.js";

const instnames = new Set(instructions.map((_) => _.name));
const regNames = new Set<string>([...registerNames.int.flat(), ...registerNames.float.flat()]);

type partTypes =
	| "string"
	| "comment"
	| "space"
	| "invalidString"
	| "parentheses"
	| "instruction"
	| "number"
	| "register"
	| "variable"
	| "label"
	| "char"
	| "invalidChar"
	| "directive"
	| "unknown";
type parsedPart = {content: string; type: partTypes};

function identifySegment(str: string): parsedPart {
	if (instnames.has(str)) {
		return {
			type: "instruction",
			content: str,
		};
	} else if (!isNaN(Number(str)) || str === "NaN") {
		return {
			type: "number",
			content: str,
		};
	} else if (regNames.has(str)) {
		return {
			type: "register",
			content: str,
		};
	} else if (str.startsWith("%")) {
		return {
			type: "variable",
			content: str,
		};
	} else if (str.endsWith(":")) {
		return {
			type: "label",
			content: str,
		};
		//TODO this needs to check if it's a valid directive
	} else if (str.startsWith(".")) {
		return {
			type: "directive",
			content: str,
		};
	} else {
		return {
			type: "unknown",
			content: str,
		};
	}
}
function* parseLine(str: string) {
	const strings = str.matchAll(
		/((["'])((?:\\.|(?!\2).)*)\2?)|(#[^\n]*)|((?:(?!(["'])(?:(?:\\.|(?!\6).)*)|#).)*)/gm,
	);
	let map = strings.map((_) => {
		return {
			content: _[0],
			match: _[0][0] === "'" || _[0][0] === '"',
		};
	});

	const rest = map.map(
		(part: {match?: boolean; content: string; type?: partTypes}): parsedPart | parsedPart[] => {
			if (part.match) {
				delete part.match;
				if (part.content.startsWith('"')) {
					part.type = "string";
					if (!part.content.endsWith('"')) {
						part.type = "invalidString";
					}
				} else {
					part.type = "char";
					if (!part.content.endsWith("'")) {
						part.type = "invalidChar";
					}
				}
				return part as parsedPart;
			}
			if (part.content.startsWith("#")) {
				return {
					type: "comment",
					content: part.content,
				};
			}
			const build: parsedPart[] = [];
			for (const [, match, space] of part.content.matchAll(/([^,()\s]*)([,()\s]*)/gm)) {
				if (match) {
					build.push(identifySegment(match));
				}
				if (space) {
					for (const thing of space.matchAll(/([\s,]+)|([()]+)/gm)) {
						if (thing[1]) {
							build.push({
								type: "space",
								content: thing[1],
							});
						} else if (thing[2]) {
							for (const char of thing[2].split("")) {
								build.push({
									type: "parentheses",
									content: char as "(" | ")",
								});
							}
						}
					}
				}
			}
			return build;
		},
	);
	for (const thing of rest) {
		if (thing instanceof Array) {
			for (const item of thing) {
				yield item;
			}
		} else {
			yield thing;
		}
	}
}
export {parseLine, parsedPart};
