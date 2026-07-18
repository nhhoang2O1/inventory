import { Injectable } from '@nestjs/common';
import { canDecideApproval, type ApprovalCheck, type ApprovalDecision } from '@wms/contracts';

@Injectable()
export class ApprovalPolicyService {
  canDecide(input: ApprovalCheck): ApprovalDecision {
    return canDecideApproval(input);
  }
}
