export const IDL = {
  version: "0.1.0",
  name: "project_mappers",
  instructions: [
    {
      name: "initializeJob",
      accounts: [
        { name: "client",        isMut: true,  isSigner: true  },
        { name: "freelancer",    isMut: false, isSigner: false },
        { name: "oracle",        isMut: false, isSigner: false },
        { name: "escrowAccount", isMut: true,  isSigner: false },
        { name: "vaultAccount",  isMut: true,  isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "jobId",  type: "string" },
        { name: "amount", type: "u64"    },
      ],
    },
    {
      name: "releasePayment",
      accounts: [
        { name: "authority",     isMut: false, isSigner: true  },
        { name: "freelancer",    isMut: true,  isSigner: false },
        { name: "client",        isMut: true,  isSigner: false },
        { name: "escrowAccount", isMut: true,  isSigner: false },
        { name: "vaultAccount",  isMut: true,  isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "cancelJob",
      accounts: [
        { name: "oracle",        isMut: false, isSigner: true  },
        { name: "client",        isMut: true,  isSigner: false },
        { name: "escrowAccount", isMut: true,  isSigner: false },
        { name: "vaultAccount",  isMut: true,  isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "GigEscrow",
      type: {
        kind: "struct",
        fields: [
          { name: "client",      type: "publicKey"              },
          { name: "freelancer",  type: "publicKey"              },
          { name: "oracle",      type: "publicKey"              },
          { name: "amount",      type: "u64"                    },
          { name: "jobId",       type: "string"                 },
          { name: "status",      type: { defined: "JobStatus" } },
          { name: "escrowBump",  type: "u8"                     },
          { name: "vaultBump",   type: "u8"                     },
        ],
      },
    },
  ],
  types: [
    {
      name: "JobStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Pending"   },
          { name: "Completed" },
          { name: "Cancelled" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "JobIdTooLong",           msg: "Job ID exceeds the 32-character maximum."        },
    { code: 6001, name: "InvalidAmount",           msg: "Amount must be greater than zero."               },
    { code: 6002, name: "AmountBelowRentExemption",msg: "Amount is below the rent-exempt minimum."        },
    { code: 6003, name: "JobNotPending",           msg: "Job is not in a Pending state."                  },
    { code: 6004, name: "UnauthorizedExecution",   msg: "Signer is neither the client nor the oracle."    },
    { code: 6005, name: "InvalidFreelancerTarget", msg: "Target does not match the assigned freelancer."  },
    { code: 6006, name: "InvalidOracleAuthority",  msg: "Only the oracle can authorize cancellation."     },
    { code: 6007, name: "InvalidClientAuthority",  msg: "Refund target does not match the original client." },
  ],
} as const;
