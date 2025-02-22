import {instructions, registerNames} from "../fetches.js";
import {I18n} from "../i18n.js";
import {runTimeError} from "./emulator.js";

function parseInt(inst: number) {
	const opcode = inst & 0b1111111;
	const funct3 = (inst & (7 << 12)) >> 12;
	const funct7 = (inst & (0b1111111 << 25)) >> 25;
	const rd = (inst & (0b11111 << 7)) >> 7;
	const rs1 = (inst & (0b11111 << 15)) >> 15;
	const rs2 = (inst & (0b11111 << 20)) >> 20;
	function R() {
		return {
			type: "R" as "R",
			opcode,
			funct3,
			funct7,
			rd,
			rs1,
			rs2,
		};
	}
	function I() {
		return {
			type: "I" as "I",
			opcode,
			funct3,
			rd,
			rs1,
			imm: rs2 | (funct7 << 5),
		};
	}
	function S() {
		return {
			type: "S" as "S",
			opcode,
			funct3,
			rs1,
			rs2,
			imm: rd | (funct7 << 5),
		};
	}
	function B() {
		const imm =
			((rd & 1) << 11) | (rd & 0b11110) | ((funct7 & 0b111111) << 5) | ((funct7 & 0b1000000) << 6);
		return {
			type: "B" as "B",
			opcode,
			funct3,
			rs1,
			rs2,
			imm: imm > 4095 ? imm - 8192 : imm,
		};
	}
	function J() {
		const imm =
			(rs1 << 15) |
			(funct3 << 12) |
			((rs2 & 1) << 11) |
			(rs2 & 0b11110) |
			((funct7 & 0b111111) << 5) |
			((funct7 & 0b1000000) << 14);
		return {
			type: "J" as "J",
			opcode,
			rd,
			imm: imm > 1048575 ? imm - 2097152 : imm,
		};
	}
	function U() {
		return {
			type: "U" as "U",
			opcode,
			rd,
			imm: inst & 0xfffff000,
		};
	}
	function W() {
		return {
			type: "W" as "W",
			inst,
		};
	}

	switch (opcode) {
		case 0b0110011:
			return R();
		case 0b0010011:
		case 0b0000011:
		case 0b1100111:
			return I();
		case 0b0100011:
			return S();
		case 0b1100011:
			return B();
		case 0b1101111:
			return J();
		case 0b0110111:
		case 0b0010111:
			return U();
		case 0b1110011:
			return W();
		default:
			throw new runTimeError(I18n.runTimeErrors.unknownInstruction(opcode.toString(2)));
	}
}

const instFilter = instructions.filter((_) => _.type !== "fake" && _.type !== "veryfake");
function toAsm(numb: number) {
	const parse = parseInt(numb);
	function toRegiName(numb: number, float: boolean) {
		if (float) {
			return registerNames.float[numb][0];
		} else {
			return registerNames.int[numb][0];
		}
	}
	switch (parse.type) {
		case "R": {
			const inst = instFilter.find(
				(_) =>
					_.type == "R" &&
					_.opcode == parse.opcode &&
					_.funct3 == parse.funct3 &&
					_.funct7 == parse.funct7,
			);
			let name = "unknowinst";
			let args = [false, false, false];
			if (inst && inst.type == "R") {
				name = inst.name;
				args = inst.args.map((_) => _ === "freg");
			}
			return `${name} ${toRegiName(parse.rd, args[0])},${toRegiName(parse.rs1, args[1])},${toRegiName(parse.rs2, args[2])}`;
		}
		case "I": {
			const inst = instFilter.find(
				(_) => _.type == "I" && _.opcode == parse.opcode && _.funct3 == parse.funct3,
			);
			let name = "unknowinst";
			let args = [false, false, false];
			const strImm =
				parse.imm < 0 ? `-0x${Math.abs(parse.imm).toString(16)}` : `0x${parse.imm.toString(16)}`;
			if (parse.opcode === 0x1) {
				if (parse.imm >> 5 === 0) {
					return `slli ${toRegiName(parse.rd, args[0])},${toRegiName(parse.rs1, args[1])},${strImm}`;
				} else {
					return "unknown";
				}
			}
			if (parse.opcode === 0x5) {
				if (parse.imm >> 5 === 0) {
					return `srli ${toRegiName(parse.rd, args[0])},${toRegiName(parse.rs1, args[1])},${strImm}`;
				} else if (parse.imm >> 5 === 0x20) {
					const strImm = `0x${(parse.imm & 0b11111).toString(16)}`;
					return `srai ${toRegiName(parse.rd, args[0])},${toRegiName(parse.rs1, args[1])},${strImm}`;
				} else {
					return "unknown";
				}
			}
			if (inst && inst.type == "I") {
				name = inst.name;
				args = inst.args.map((_) => _ === "freg");
			}
			if (!inst || inst.type != "I" || inst.args[1] !== "offreg") {
				return `${name} ${toRegiName(parse.rd, args[0])},${toRegiName(parse.rs1, args[1])},${strImm}`;
			} else {
				return `${name} ${toRegiName(parse.rd, args[0])},${strImm}(${toRegiName(parse.rs1, args[1])})`;
			}
		}
		case "S": {
			const inst = instFilter.find(
				(_) => _.type == "S" && _.opcode == parse.opcode && _.funct3 == parse.funct3,
			);
			let name = "unknowinst";
			let args = [false, false, false];
			if (inst && inst.type == "S") {
				name = inst.name;
				args = inst.args.map((_) => _ === "freg");
			}
			const strImm =
				parse.imm < 0 ? `-0x${Math.abs(parse.imm).toString(16)}` : `0x${parse.imm.toString(16)}`;
			return `${name} ${toRegiName(parse.rs1, args[0])},${strImm}(${toRegiName(parse.rs2, false)})`;
		}
		case "B": {
			const inst = instFilter.find(
				(_) => _.type == "B" && _.opcode == parse.opcode && _.funct3 == parse.funct3,
			);
			let name = "unknowinst";
			let args = [false, false, false];
			if (inst && inst.type == "B") {
				name = inst.name;
				args = inst.args.map((_) => _ === "freg");
			}
			const strImm =
				parse.imm < 0 ? `-0x${Math.abs(parse.imm).toString(16)}` : `0x${parse.imm.toString(16)}`;
			return `${name} ${toRegiName(parse.rs1, args[0])},${toRegiName(parse.rs2, false)},${strImm}`;
		}
		case "U": {
			const inst = instFilter.find((_) => _.type == "U" && _.opcode == parse.opcode);
			let name = "unknowinst";
			if (inst) {
				name = inst.name;
			}
			const strImm =
				parse.imm < 0 ? `-0x${Math.abs(parse.imm).toString(16)}` : `0x${parse.imm.toString(16)}`;

			return `${name} ${toRegiName(parse.rd, false)} ${strImm}`;
		}
		case "J": {
			const inst = instFilter.find((_) => _.type == "J" && _.opcode == parse.opcode);
			let name = "unknowinst";
			if (inst) {
				name = inst.name;
			}
			const strImm =
				parse.imm < 0 ? `-0x${Math.abs(parse.imm).toString(16)}` : `0x${parse.imm.toString(16)}`;
			return `${name} ${toRegiName(parse.rd, false)},${strImm}`;
		}
		case "W": {
			const inst = instFilter.find((_) => _.type == "W" && _.code == parse.inst);
			let name = "unknowinst";
			if (inst) {
				name = inst.name;
			}
			return `${name}`;
		}
	}
}
export {parseInt, toAsm};
