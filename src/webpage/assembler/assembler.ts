import {Ram} from "../emulator/ram.js";
import {I18n} from "../i18n.js";
import {parseLine} from "./parser.js";
import {instructions, registerNames} from "../fetches.js";

const regNames = new Map<string, {type: "register"; number: number; floating: boolean}>([
	...registerNames.int
		.map((_, i) => {
			return _.map(
				(_) =>
					[
						_,
						{
							type: "register",
							number: i,
							floating: false,
						},
					] as [string, {type: "register"; number: number; floating: boolean}],
			);
		})
		.flat(1),
	...registerNames.float
		.map((_, i) => {
			return _.map(
				(_) =>
					[
						_,
						{
							type: "register",
							number: i,
							floating: true,
						},
					] as [string, {type: "register"; number: number; floating: boolean}],
			);
		})
		.flat(1),
]);
const instMap = new Map(
	instructions.map((_) => {
		const name = _.name;
		return [name, _];
	}),
);
/*
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
*/
type symbolType =
	| {
			content: string;
			type: "variable" | "label";
	  }
	| {
			content: string;
			type: "string";
	  }
	| {
			type: "register";
			number: number;
			floating: boolean;
	  }
	| {
			content: string;
			type: "instruction";
	  }
	| {
			type: "directive";
			content: string;
	  }
	| {
			type: "unknown";
			content: string;
	  }
	| {
			type: "parentheses";
			contains: symbolType[];
	  }
	| {
			type: "int";
			content: bigint;
	  }
	| {
			type: "float";
			content: number;
	  };
class AssemblError extends Error {
	readonly line: number;
	constructor(reason: string, line: number) {
		super(reason);
		this.line = line;
	}
}
type linkerInfo = Map<
	number,
	{
		label: string;
		type: "dword" | "word" | "byte" | "half" | "I" | "RI" | "S" | "RS" | "B" | "U" | "AU" | "J";
		line: number;
	}
>;
type labelMap = Map<string, number>;
function assemble(code: string) {
	const basicParsing = code.split("\n").map((_) => parseLine(_));
	let i = 0;
	let directive: "double" | "float" | "dword" | "word" | "byte" | "half" | "ascii" | "asciz" =
		"word";
	let place: "text" | "data" = "text";
	function getCurAddress() {
		if (place == "data") {
			return dataIndex + 0x10010000;
		} else if (place == "text") {
			return textIndex + 0x00400000;
		} else {
			throw new AssemblError("internal error please fix", NaN);
		}
	}

	const labelMap: labelMap = new Map();

	const textView = new DataView(new ArrayBuffer(1 << 22));
	let textIndex = 0;

	const dataView = new DataView(new ArrayBuffer(1 << 22));
	let dataIndex = 0;
	const dataLables: linkerInfo = new Map();

	function placeData(
		data:
			| {type: "int"; content: bigint}
			| {type: "float"; content: number}
			| {type: "string"; content: string}
			| {type: "unknown"; content: string}
			| {
					type: "instruction";
					content: number;
					link?: {type: "I" | "RI" | "S" | "RS" | "B" | "U" | "AU" | "J"; label: string};
			  },
	) {
		if (place === "text" && data.type !== "instruction") {
			if (data.type === "int") {
				throw new AssemblError(I18n.errors.dataInText(i + 1 + "", data.content + ""), i);
			}
			throw new AssemblError(I18n.errors.dataInText(i + 1 + "", JSON.stringify(data.content)), i);
		}
		if ((directive === "ascii" || directive === "asciz") && place === "data") {
			if (data.type !== "string") {
				throw new AssemblError(I18n.errors.notAString(i + 1 + "", data.type), i);
			}
			const encode = new TextEncoder().encode(data.content);
			for (const char of encode) {
				dataView.setUint8(dataIndex, char);
				dataIndex += 1;
			}
			if (directive === "asciz") {
				dataView.setUint8(dataIndex, 0);
				dataIndex += 1;
			}
			return;
		} else if (data.type === "string") {
			debugger;
			throw new AssemblError(I18n.errors.stringOutsideOfDirrective(i + 1 + ""), i);
		}
		if (data.type === "float") {
			if (directive === "float") {
				dataView.setFloat32(dataIndex, data.content, true);
				dataIndex += 4;
			} else if (directive === "double") {
				dataView.setFloat64(dataIndex, data.content, true);
				dataIndex += 8;
			} else {
				throw new AssemblError(I18n.errors.wrongDirrectiveFloat(i + 1 + ""), i);
			}
		} else if (data.type == "int") {
			if (directive === "byte") {
				dataView.setUint8(dataIndex, Number(data.content & 0xffn));
				dataIndex += 1;
			} else if (directive === "half") {
				dataView.setUint16(dataIndex, Number(data.content & 0xffffn), true);
				dataIndex += 2;
			} else if (directive === "word") {
				dataView.setUint32(dataIndex, Number(data.content & 0xffffffffn), true);
				dataIndex += 4;
			} else if (directive === "dword") {
				dataView.setBigUint64(dataIndex, data.content, true);
				dataIndex += 8;
			} else if (directive === "float") {
				dataView.setFloat32(dataIndex, Number(data.content), true);
				dataIndex += 4;
			} else if (directive === "double") {
				dataView.setFloat64(dataIndex, Number(data.content), true);
				dataIndex += 8;
			} else {
				throw new AssemblError("internal error, please fix", NaN);
			}
		} else if (data.type === "unknown") {
			if (directive == "float" || directive == "double") {
				throw new AssemblError(I18n.errors.lableCantFloat(i + 1 + ""), i);
			} else {
				dataLables.set(getCurAddress(), {label: data.content, type: directive, line: i});
				if (directive === "byte") {
					dataIndex += 1;
				} else if (directive === "half") {
					dataIndex += 2;
				} else if (directive === "word") {
					dataIndex += 4;
				} else if (directive === "dword") {
					dataIndex += 8;
				}
			}
		} else if (data.type === "instruction") {
			if (data.link) {
				dataLables.set(getCurAddress(), {label: data.link.label, type: data.link.type, line: i});
			}
			if (place === "text") {
				textView.setUint32(textIndex, data.content, true);
				textIndex += 4;
			} else {
				dataView.setUint32(dataIndex, data.content, true);
				dataIndex += 4;
			}
		} else {
			throw new AssemblError("internal error, please fix", NaN);
		}
	}

	for (const line of basicParsing) {
		let s = 0;
		const lineArr = [...line];
		function handleDirrective(data: {type: "directive"; content: string}) {
			switch (data.content) {
				case "data":
					place = "data";
					break;
				case "text":
					place = "text";
					break;
				case "ascii":
				case "asciz":
				case "double":
				case "float":
				case "byte":
				case "word":
				case "dword":
				case "half":
					if (place === "text") {
						throw new AssemblError(I18n.errors.dataDirectiveInText(i + 1 + ""), i);
					}
					directive = data.content;
					break;
				default:
					throw new AssemblError(I18n.errors.unknownDirective(i + 1 + "", data.content), i);
			}
		}
		const helperNext = (itterate = true) => {
			return lineArr[(s += +itterate) - +itterate];
		};
		function getNextSymbol(
			helper = helperNext,
			varMap = new Map<string, symbolType>(),
		): symbolType | undefined {
			const symbol = helper();
			if (!symbol) return undefined;
			switch (symbol.type) {
				case "comment":
				case "space":
					return getNextSymbol(helper);
				case "invalidString":
					throw new AssemblError(I18n.errors.invalidString(i + 1 + ""), i);
				case "invalidChar":
					throw new AssemblError(I18n.errors.invalidChar(i + 1 + ""), i);
				case "char":
					if (
						symbol.content.length > 3 &&
						!(symbol.content.length === 4 && symbol.content[1] == "\\")
					) {
						throw new AssemblError(I18n.errors.CharTooLong(i + 1 + ""), i);
					}
					break;
			}
			if (symbol.type === "parentheses") {
				if (symbol.content === "(") {
					const innards: symbolType[] = [];
					while (true) {
						if (helper(false).type === "parentheses") {
							if (helper(false).content === ")") {
								s++;
								return {
									type: "parentheses",
									contains: innards,
								};
							} else {
								throw new AssemblError(I18n.errors.ParNoMatch(i + 1 + ""), i);
							}
						}
						const next = getNextSymbol(helper);
						if (!next) throw new AssemblError(I18n.errors.ParNoMatch(i + 1 + ""), i);
						innards.push(next);
					}
				} else {
					throw new AssemblError(I18n.errors.ParNoMatch(i + 1 + ""), i);
				}
			} else if (symbol.type === "char") {
				const char = [...symbol.content];
				char.pop();
				char.shift();
				const str = JSON.parse(`"${char.join("")}"`) as string;
				if (str.length !== 1) {
					throw new AssemblError(I18n.errors.CharTooLong(i + 1 + ""), i);
				}
				return {
					type: "int",
					content: BigInt(new TextEncoder().encode(str)[0]),
				};
			} else if (symbol.type === "number") {
				try {
					return {
						type: "int",
						content: BigInt(symbol.content),
					};
				} catch {
					return {
						type: "float",
						content: +symbol.content,
					};
				}
			} else if (symbol.type === "label") {
				const arr = [...symbol.content];
				arr.pop();
				return {
					type: "label",
					content: arr.join(""),
				};
			} else if (symbol.type === "directive") {
				const arr = [...symbol.content];
				arr.shift();
				return {
					type: "directive",
					content: arr.join(""),
				};
			} else if (symbol.type === "string") {
				const arr = [...symbol.content];
				arr.shift();
				arr.pop();
				return {
					type: "string",
					content: arr.join(""),
				};
			} else if (symbol.type === "register") {
				const reg = regNames.get(symbol.content);
				if (reg === undefined) throw new AssemblError("internal error fix me", NaN);
				return reg;
			} else if (symbol.type === "variable") {
				const arr = [...symbol.content];
				arr.shift();
				const content = arr.join("");
				const mapped = varMap.get(content);
				if (mapped) {
					return mapped;
				}
				return {
					type: "variable",
					content,
				};
			}
			return {
				type: symbol.type,
				content: symbol.content,
			};
		}
		function handleInstruction(data: {type: "instruction"; content: string}) {
			function get12Bit() {
				const sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				if (sym.type !== "int") throw new AssemblError(I18n.errors.expectedInt(i + 1 + ""), i);
				if (sym.content < -2048n || sym.content > 2047n) {
					throw new AssemblError(I18n.errors.OutOfBounts12bit(i + 1 + "", sym.content + ""), i);
				}
				return Number(sym.content);
			}
			function getNumb() {
				const sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				if (sym.type !== "int") throw new AssemblError(I18n.errors.expectedInt(i + 1 + ""), i);
				return Number(sym.content);
			}
			function get5Bit() {
				const sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				if (sym.type !== "int") throw new AssemblError(I18n.errors.expectedInt(i + 1 + ""), i);
				if (sym.content < 0n || sym.content > 31n) {
					throw new AssemblError(I18n.errors.OutOfBounds5bit(i + 1 + "", sym.content + ""), i);
				}
				return Number(sym.content);
			}
			function getRegi(float = false) {
				const sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				if (sym.type !== "register")
					throw new AssemblError(I18n.errors.expectedRegi(i + 1 + ""), i);
				if (!float && sym.floating) {
					throw new AssemblError(I18n.errors.expectIntReg(i + 1 + ""), i);
				} else if (float && !sym.floating) {
					throw new AssemblError(I18n.errors.expectFloatReg(i + 1 + ""), i);
				}
				return sym.number;
			}
			function getOffReg(type: "I" | "S", load: false | number) {
				let sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				let offset = 0n;
				switch (sym.type) {
					//@ts-expect-error
					case "int":
						offset = sym.content;
						const prev = sym;
						sym = getNextSymbol();
						if (!sym) {
							if (prev.content > 2047n || prev.content < -2048n) {
								if (load !== false) {
									if (prev.content !== (prev.content & 0xffffffffn)) {
									}
									placeData({
										type: "instruction",
										content:
											0b0110111 | (load << 7) | ((Number(prev.content & 0xffffffffn) >> 12) << 12),
									});
									return {
										reg: load,
										offset: Number(offset) & 0xfff,
									};
								} else {
									throw new AssemblError(
										I18n.errors.OutOfBountsOff12bit(i + 1 + "", prev.content + ""),
										i,
									);
								}
							}
							return {
								reg: 0,
								offset: Number(offset) & 0xfff,
							};
						} else if (sym.type == "parentheses") {
							//fall
						} else {
							throw new AssemblError(I18n.errors.expectOffreg(i + 1 + ""), i);
						}
					case "parentheses":
						if (sym.contains.length > 1) {
							throw new AssemblError(I18n.errors.TooManyPars(i + 1 + ""), i);
						} else if (sym.contains.length === 0) {
							throw new AssemblError(I18n.errors.TooFewPars(i + 1 + ""), i);
						}
						if (sym.contains[0].type !== "register") {
							throw new AssemblError(I18n.errors.expectOffreg(i + 1 + ""), i);
						} else if (sym.contains[0].floating) {
							throw new AssemblError(I18n.errors.expectIntReg(i + 1 + ""), i);
						}
						return {
							reg: sym.contains[0].number,
							offset: Number(offset) & 0xfff,
						};
					case "unknown":
						if (load === false) {
							const sym = getNextSymbol();
							if (!sym)
								throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
							if (sym.type !== "register") {
								throw new AssemblError(I18n.errors.expectedRegi(i + 1 + ""), i);
							} else if (sym.floating) {
								throw new AssemblError(I18n.errors.expectIntReg(i + 1 + ""), i);
							}
							load = sym.number;
						}
						placeData({
							type: "instruction",
							content: 0b0010111 | (load << 7),
							link: {type: "AU", label: sym.content},
						});
						dataLables.set(getCurAddress(), {
							label: sym.content,
							type: ("R" + type) as "RI" | "RS",
							line: i,
						});
						return {
							reg: load,
							offset: 0,
						};
					default:
						throw new AssemblError(I18n.errors.expectOffreg(i + 1 + ""), i);
				}
			}
			function getLabel() {
				const sym = getNextSymbol();
				if (!sym) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
				if (sym.type !== "unknown")
					throw new AssemblError(I18n.errors.expectedLabel(i + 1 + ""), i);
				return sym.content;
			}
			function assertClear() {
				const sym = getNextSymbol();
				if (sym) throw new AssemblError(I18n.errors.tooManyArguments(i + 1 + ""), i);
			}
			const info = instMap.get(data.content);
			if (!info) throw new AssemblError("internal error fix me", i);

			switch (info.type) {
				case "R": {
					const lay =
						info.opcode |
						(getRegi(info.args[0] === "freg") << 7) |
						(info.funct3 << 12) |
						(getRegi(info.args[1] === "freg") << 15) |
						(info.funct7 << 25) |
						(getRegi(info.args[2] === "freg") << 20);
					assertClear();
					placeData({type: "instruction", content: lay});
					break;
				}
				case "I": {
					if (info.args[1] === "offreg") {
						const reg = getRegi(info.args[0] === "freg");
						const off = getOffReg("I", reg);
						const lay =
							info.opcode | (reg << 7) | (info.funct3 << 12) | (off.reg << 15) | (off.offset << 20);
						placeData({type: "instruction", content: lay});
					} else if (info.pimm !== undefined) {
						const lay =
							info.opcode |
							(getRegi(info.args[0] === "freg") << 7) |
							(info.funct3 << 12) |
							(getRegi(info.args[1] === "freg") << 15) |
							(get5Bit() << 20) |
							(info.pimm << 25);

						placeData({type: "instruction", content: lay});
					} else {
						const lay =
							info.opcode |
							(getRegi(info.args[0] === "freg") << 7) |
							(info.funct3 << 12) |
							(getRegi(info.args[1] === "freg") << 15) |
							(get12Bit() << 20);

						placeData({type: "instruction", content: lay});
					}
					assertClear();
					break;
				}
				case "S": {
					const reg = getRegi(info.args[0] === "freg");
					const off = getOffReg("S", reg);
					const lay =
						info.opcode |
						((off.offset & 0b11111) << 7) |
						(info.funct3 << 12) |
						(off.reg << 15) |
						(reg << 20) |
						((off.offset >> 5) << 25);
					placeData({type: "instruction", content: lay});
					assertClear();
					break;
				}
				case "B": {
					const lay =
						info.opcode |
						(info.funct3 << 12) |
						(getRegi(info.args[0] === "freg") << 15) |
						(getRegi(info.args[1] === "freg") << 20);
					placeData({
						type: "instruction",
						content: lay,
						link: {
							type: "B",
							label: getLabel(),
						},
					});
					assertClear();
					break;
				}
				case "J": {
					const lay = info.opcode | (getRegi() << 7);
					placeData({
						type: "instruction",
						content: lay,
						link: {
							type: "J",
							label: getLabel(),
						},
					});
					assertClear();
					break;
				}
				case "U": {
					let lay = info.opcode | (getRegi(info.args[0] === "freg") << 7);
					let next = getNextSymbol();
					if (!next) throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
					if (next.type === "variable" || next.type == "unknown") {
						if (next.type === "variable") {
							next = getNextSymbol();
							if (!next)
								throw new AssemblError(I18n.errors.InstructionNeededMoreParams(i + 1 + ""), i);
							if (next.type !== "parentheses")
								throw new AssemblError(I18n.errors.expectedLabelPars(i + 1 + ""), i);
							if (next.contains.length > 1)
								throw new AssemblError(I18n.errors.TooManyPars(i + 1 + ""), i);
							if (next.contains.length < 1)
								throw new AssemblError(I18n.errors.TooFewPars(i + 1 + ""), i);
							next = next.contains[0];
							if (next.type !== "unknown")
								throw new AssemblError(I18n.errors.expectedLabel(i + 1 + ""), i);
						}
						placeData({
							type: "instruction",
							content: lay,
							link: {
								type: info.name === "auipc" ? "AU" : "U",
								label: next.content,
							},
						});
					} else if (next.type === "int") {
						if (next.content < -524288n || next.content > 524287n) {
							throw new AssemblError(I18n.errors.OutOfBounts20bit(i + 1 + ""), i);
						}
						lay = lay | (Number(next.content) << 12);
						placeData({
							type: "instruction",
							content: lay,
						});
					} else {
						throw new AssemblError(I18n.errors.UErrorType2(i + 1 + ""), i);
					}
					assertClear();
					break;
				}
				case "W": {
					placeData({type: "instruction", content: info.code});
					assertClear();
					break;
				}
				case "reallyfake": {
					switch (info.name) {
						case "la": {
							const reg = getRegi();
							const label = getLabel();
							assertClear();
							placeData({
								type: "instruction",
								content: 0b0010111 | (reg << 7),
								link: {type: "AU", label},
							});
							placeData({
								type: "instruction",
								content: 0b0010011 | (reg << 7) | (reg << 15),
								link: {type: "RI", label},
							});
							break;
						}
						case "li": {
							const reg = getRegi();
							const numb = getNumb();
							assertClear();
							if (numb <= 2047n && numb >= -2048) {
								placeData({
									type: "instruction",
									content: 0b0010011 | (reg << 7) | (Number(numb) << 20),
								});
							} else if (numb <= 2147483647n && numb >= -2147483648) {
								placeData({
									type: "instruction",
									content: 0b0110111 | (reg << 7) | (Number(numb) & 0xfffff000),
								});
								placeData({
									type: "instruction",
									content: 0b0010011 | (reg << 7) | ((Number(numb) & 0xfff) << 20),
								});
							}
							break;
						}
					}
				}
			}
		}
		while (true) {
			const sym = getNextSymbol();
			if (!sym) {
				break;
			}

			switch (sym.type) {
				case "unknown":
				case "int":
				case "float":
				case "string":
					placeData(sym);
					break;
				case "label":
					//TODO check for conflicts
					labelMap.set(sym.content, getCurAddress());
					break;
				case "register":
					throw new AssemblError(I18n.errors.loneRegister(i + 1 + ""), i);
				case "variable":
					throw new AssemblError(I18n.errors.varOutsideMacro(i + 1 + ""), i);
				case "parentheses":
					throw new AssemblError(I18n.errors.parenthesesWeird(i + 1 + ""), i);
				case "directive":
					handleDirrective(sym);
					break;
				case "instruction":
					handleInstruction(sym);
					break;
				default:
					//@ts-expect-error
					console.error(sym.type, "not handled");
			}
		}
		i++;
	}
	const ram = new Ram(dataView, textView, [dataIndex, textIndex]);
	for (const [address, thing] of dataLables) {
		const label = labelMap.get(thing.label);
		if (!label) throw new AssemblError(I18n.errors.unmatchedLabel(thing.line + ""), thing.line);
		switch (thing.type) {
			case "byte":
				ram.setInt8(address, label);
				break;
			case "half":
				ram.setInt16(address, label);
				break;
			case "word":
				ram.setInt32(address, label);
				break;
			case "dword":
				ram.setBigInt64(address, label);
				break;
			case "U": {
				const inst = ram.getInt32(address);
				ram.setInt32(address, (label & 0xfffff000) | inst);
				break;
			}
			case "AU": {
				const inst = ram.getInt32(address);
				let offset = label - address;
				if ((offset & 0xfff) > 2047) offset += 0x1000;
				ram.setInt32(address, (offset & 0xfffff000) | inst);
				break;
			}
			case "I": {
				const inst = ram.getInt32(address);
				ram.setInt32(address, ((label & 0xfff) << 20) | inst);
				break;
			}
			case "RI": {
				const inst = ram.getInt32(address);
				ram.setInt32(address, (((label - address + 4) & 0xfff) << 20) | inst);
				break;
			}
			case "B": {
				const inst = ram.getInt32(address);
				const offset = label - address;
				if (offset & 1) {
					throw new AssemblError(I18n.errors.evilJump(thing.line + ""), thing.line);
				}
				const evil =
					((offset & 0b11110) << 7) |
					((offset & 0b11111100000) << 20) |
					((offset & 0b100000000000) >>> 4) |
					((offset & 0b1000000000000) << 19);
				console.log((evil >>> 0).toString(2).padStart(32, "0"), offset.toString(16));
				ram.setInt32(address, evil | inst);
				break;
			}
			case "J": {
				const inst = ram.getInt32(address);
				const offset = label - address;
				if (offset & 1) {
					throw new AssemblError(I18n.errors.evilJump(thing.line + ""), thing.line);
				}
				const evil =
					((offset & 0b11111111110) << 20) ^
					((offset & 0b100000000000) << 9) ^
					(offset & 0b11111111000000000000) ^
					((offset & 0b100000000000000000000) << 11);
				console.log((evil >>> 0).toString(2).padStart(32, "0"), offset.toString(16));
				ram.setInt32(address, evil | inst);
				break;
			}
			default:
				throw new AssemblError("Internal error, fix me unhandled linking case:" + thing.type, NaN);
		}
	}
	return ram;
}
export {assemble, AssemblError};
