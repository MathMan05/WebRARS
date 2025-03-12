import {I18n} from "../i18n.js";
import {Console} from "./console.js";
import {parseInt} from "./parseInt.js";
import {Ram, RamStore} from "./ram.js";

parseInt;

class CSymstem {
	pc: number;
	ram: RamStore;
	intRegis: BigInt64Array;
	readonly console: Console;
	constructor(sys: Symstem) {
		this.pc = sys.pc;
		this.ram = sys.ram.compact();
		this.console = sys.console;
		this.intRegis = new BigInt64Array([...sys.intRegis]);
	}
	unCompact() {
		return new Symstem(
			this.ram.toRam(),
			this.console,
			new BigInt64Array([...this.intRegis]),
			this.pc,
		);
	}
}
class Symstem {
	ram: Ram;
	pc: number;
	intRegis: BigInt64Array;
	UintRegis: BigUint64Array;
	readonly console: Console;
	done = false;
	constructor(ram: Ram, console: Console, intRegis = new BigInt64Array(32), pc = 0x00400000) {
		this.ram = ram;
		this.console = console;
		this.intRegis = intRegis;
		this.UintRegis = new BigUint64Array(intRegis.buffer);
		this.pc = pc;
	}
	compact() {
		return new CSymstem(this);
	}
	async step(): Promise<boolean> {
		const inst = parseInt(this.ram.getUint32(this.pc));
		switch (inst.type) {
			case "U":
				this.runU(inst);
				break;
			case "I":
				this.runI(inst);
				break;
			case "R":
				this.runR(inst);
				break;
			case "S":
				this.runS(inst);
				break;
			case "W":
				return await this.runW(inst);
			case "J":
				this.runJ(inst);
				break;
			case "B":
				this.runB(inst);
				break;
			default:
				//@ts-expect-error
				throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
		this.intRegis[0] = 0n;
		return true;
	}
	runB(inst: {type: "B"; opcode: number; funct3: number; rs1: number; rs2: number; imm: number}) {
		switch (inst.opcode) {
			case 0b1100011:
				switch (inst.funct3) {
					case 0x0:
						if (this.intRegis[inst.rs1] === this.intRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					case 0x1:
						if (this.intRegis[inst.rs1] !== this.intRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					case 0x4:
						if (this.intRegis[inst.rs1] < this.intRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					case 0x5:
						if (this.intRegis[inst.rs1] >= this.intRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					case 0x6:
						if (this.UintRegis[inst.rs1] < this.UintRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					case 0x7:
						if (this.UintRegis[inst.rs1] >= this.UintRegis[inst.rs2]) {
							this.pc += inst.imm;
						} else {
							this.pc += 4;
						}
						break;
					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				break;
			default:
				throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
	}
	runJ(inst: {type: "J"; opcode: number; rd: number; imm: number}) {
		if (inst.opcode == 0b1101111) {
			this.intRegis[inst.rd] = BigInt(this.pc + 4);
			this.pc += inst.imm;
		} else {
			throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
	}
	async runW(inst: {type: "W"; inst: number}): Promise<boolean> {
		if (inst.inst === 115) {
			this.pc += 4;
			switch (this.intRegis[17]) {
				case 1n:
					this.console.addIO(this.intRegis[10] + "");
					break;
				case 4n: {
					let address = Number(this.intRegis[10]);
					let str = "";
					while (true) {
						const char = this.ram.getUint8(address++);
						if (char === 0) {
							break;
						}
						str += String.fromCharCode(char);
					}
					this.console.addIO(str);
					break;
				}
				case 10n:
					this.done = true;
					this.console.addIO("\n" + I18n.programDone("0") + "\n\n");
					return false;
				case 11n:
					this.console.addIO(
						new TextDecoder().decode(new Uint8Array([Number(this.intRegis[10] & 0xffffn)])),
					);
					break;
				default:
					throw new runTimeError(
						I18n.runTimeErrors.unknownSysCall("0x" + this.intRegis[17].toString(16)),
					);
			}
			return true;
		} else if (inst.inst === 1048691) {
			this.pc += 4;
			return false;
		} else {
			throw new runTimeError(I18n.runTimeErrors.unknownInstruction((inst.inst & 0b1111111) + ""));
		}
	}
	runU(inst: {type: "U"; opcode: number; rd: number; imm: number}) {
		switch (inst.opcode) {
			case 0b0110111:
				this.intRegis[inst.rd] = BigInt(inst.imm);
				this.pc += 4;
				return;
			case 0b0010111:
				this.intRegis[inst.rd] = BigInt(inst.imm + this.pc);
				this.pc += 4;
				return;
		}
	}
	runS(inst: {type: "S"; opcode: number; funct3: number; rs1: number; rs2: number; imm: number}) {
		switch (inst.opcode) {
			case 0b0100011:
				switch (inst.funct3) {
					case 0x0:
						this.ram.setInt8(this.intRegis[inst.rs1] + BigInt(inst.imm), this.intRegis[inst.rs2]);
						break;
					case 0x1:
						this.ram.setInt16(this.intRegis[inst.rs1] + BigInt(inst.imm), this.intRegis[inst.rs2]);
						break;
					case 0x2:
						this.ram.setInt32(this.intRegis[inst.rs1] + BigInt(inst.imm), this.intRegis[inst.rs2]);
						break;
					case 0x3:
						this.ram.setBigInt64(
							this.intRegis[inst.rs1] + BigInt(inst.imm),
							this.intRegis[inst.rs2],
						);
						break;
					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				this.pc += 4;
				return;
			default:
				throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
	}
	runR(inst: {
		type: "R";
		opcode: number;
		funct3: number;
		funct7: number;
		rd: number;
		rs1: number;
		rs2: number;
	}) {
		switch (inst.opcode) {
			case 0b0110011:
				switch (inst.funct3) {
					case 0x0:
						switch (inst.funct7) {
							case 0x00:
								this.intRegis[inst.rd] = this.intRegis[inst.rs1] + this.intRegis[inst.rs2];
								break;
							case 0x20:
								this.intRegis[inst.rd] = this.intRegis[inst.rs1] - this.intRegis[inst.rs2];
								break;
							default:
								throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x1:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] << this.intRegis[inst.rs2];
						break;
					case 0x2:
						if (inst.funct7 === 0) {
							this.UintRegis[inst.rd] =
								this.UintRegis[inst.rs1] < this.UintRegis[inst.rs2] ? 1n : 0n;
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x3:
						if (inst.funct7 === 0) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] < this.intRegis[inst.rs2] ? 1n : 0n;
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x4:
						if (inst.funct7 === 0) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] ^ this.intRegis[inst.rs2];
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x5:
						if (inst.funct7 === 0) {
							this.UintRegis[inst.rd] = this.UintRegis[inst.rs1] >> this.UintRegis[inst.rs2];
						} else if (inst.funct7 === 0x20) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] >> this.intRegis[inst.rs2];
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x6:
						if (inst.funct7 === 0) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] | this.intRegis[inst.rs2];
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x7:
						if (inst.funct7 === 0) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] & this.intRegis[inst.rs2];
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;

					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				this.pc += 4;
				break;
			default:
				throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
	}
	runI(inst: {type: "I"; opcode: number; funct3: number; rd: number; rs1: number; imm: number}) {
		switch (inst.opcode) {
			case 0b0011011:
				switch (inst.funct3) {
					case 0:
						const res = (this.intRegis[inst.rs1] + BigInt(inst.imm)) & 0xffffffffn;
						const out = BigInt(Number(res) >> 0);
						this.intRegis[inst.rd] = out;
						break;
					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				this.pc += 4;
				break;
			case 0b0010011:
				switch (inst.funct3) {
					case 0:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] + BigInt(inst.imm);
						break;
					case 0x1:
						if (inst.imm >> 5 === 0) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] << (BigInt(inst.imm) & 0b11111n);
							break;
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
					case 0x2:
						this.UintRegis[inst.rd] = this.UintRegis[inst.rs1] < BigInt(inst.imm >>> 0) ? 1n : 0n;
						break;
					case 0x3:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] < BigInt(inst.imm) ? 1n : 0n;
						break;
					case 0x4:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] ^ BigInt(inst.imm);
						break;
					case 0x5:
						if (inst.imm >> 5 === 0) {
							this.UintRegis[inst.rd] = this.UintRegis[inst.rs1] >> (BigInt(inst.imm) & 0b11111n);
						} else if (inst.imm >> 5 === 0x20) {
							this.intRegis[inst.rd] = this.intRegis[inst.rs1] >> (BigInt(inst.imm) & 0b11111n);
						} else {
							throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
						}
						break;
					case 0x6:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] | BigInt(inst.imm);
						break;
					case 0x7:
						this.intRegis[inst.rd] = this.intRegis[inst.rs1] & BigInt(inst.imm);
						break;
					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				this.pc += 4;
				break;
			case 0b0000011:
				switch (inst.funct3) {
					case 0x0:
						this.intRegis[inst.rd] = BigInt(
							this.ram.getInt8(this.intRegis[inst.rs1] + BigInt(inst.imm)),
						);
						break;
					case 0x1:
						this.intRegis[inst.rd] = BigInt(
							this.ram.getInt16(this.intRegis[inst.rs1] + BigInt(inst.imm)),
						);
						break;
					case 0x2:
						this.intRegis[inst.rd] = BigInt(
							this.ram.getInt32(this.intRegis[inst.rs1] + BigInt(inst.imm)),
						);
						break;
					case 0x3:
						this.intRegis[inst.rd] = this.ram.getBigInt64(
							this.intRegis[inst.rs1] + BigInt(inst.imm),
						);
						break;
					case 0x4:
						this.intRegis[inst.rd] = BigInt(
							this.ram.getUint8(this.intRegis[inst.rs1] + BigInt(inst.imm)),
						);
						break;
					case 0x5:
						this.intRegis[inst.rd] = BigInt(
							this.ram.getUint16(this.intRegis[inst.rs1] + BigInt(inst.imm)),
						);
						break;
					default:
						throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
				}
				this.pc += 4;
				break;
			case 0b1110011:
				if (inst.funct3 === 0) {
					this.intRegis[inst.rd] = BigInt(this.pc + 4);
					this.pc += inst.imm + Number(this.intRegis[inst.rs1]);
				}
				break;
			default:
				throw new runTimeError(I18n.runTimeErrors.unknownInstruction(inst.opcode + ""));
		}
	}
}
class runTimeError extends Error {
	constructor(message: string) {
		super(message);
	}
}
export {runTimeError, Symstem, CSymstem};
