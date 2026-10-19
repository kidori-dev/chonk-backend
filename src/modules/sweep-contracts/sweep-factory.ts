import { keccak256, toUtf8Bytes } from 'ethers';

/**
 * SweepFactory 컨트랙트(contracts/src/SweepFactory.sol)에서 서버가 쓰는 함수/이벤트.
 * 사람이 읽을 수 있는 형태의 ABI 라서 forge build 결과물 없이도 호출할 수 있다.
 */
export const SWEEP_FACTORY_ABI = [
  'function owner() view returns (address)',
  'function treasury() view returns (address)',
  'function predictAddress(bytes32 salt) view returns (address)',
  'function sweep(bytes32[] salts, address[] tokens)',
  'event WalletDeployed(bytes32 indexed salt, address indexed wallet)',
  'event Swept(address indexed wallet, address indexed token, address indexed to, uint256 amount)',
];

/** 잔액 조회 / 표시에 쓰는 ERC20 함수 */
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

/**
 * 입금 주소의 salt 를 만든다. 같은 라벨이면 항상 같은 salt → 같은 입금 주소가 나온다.
 * - 라벨(예: 유저 ID "user-1") → keccak256(라벨)
 * - 이미 32바이트 hex(0x + 64자리)면 그대로 salt 로 쓴다
 */
export function toSalt(label: string): string {
  return /^0x[0-9a-fA-F]{64}$/.test(label) ? label.toLowerCase() : keccak256(toUtf8Bytes(label));
}
