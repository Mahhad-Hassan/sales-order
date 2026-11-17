import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { FrappeDocTypeMetadata } from '../models/frappe-api.model';
import { FrappeApiService } from './frappe-api.service';

interface FrappeUserCompanyPermission {
  for_value: string;
  apply_to_all_doctypes?: number;
  applicable_for?: string | null;
}

export interface CompanyAccess {
  allowedCompanyNames: string[] | null;
  canChangeCompany: boolean;
}

@Injectable({ providedIn: 'root' })
export class FrappeCompanyAccessService {
  private readonly api = inject(FrappeApiService);

  getAccess(user: string, doctype: string): Observable<CompanyAccess> {
    return forkJoin({
      permissions: this.api.getList<FrappeUserCompanyPermission>(
        'User Permission',
        ['for_value', 'apply_to_all_doctypes', 'applicable_for'],
        [['user', '=', user], ['allow', '=', 'Company']],
        500,
      ),
      profile: this.api.getDocument<{ roles?: Array<{ role: string }> }>('User', user),
      companyMetadata: this.api.getDocument<FrappeDocTypeMetadata>('DocType', 'Company'),
    }).pipe(map(({ permissions, profile, companyMetadata }) => {
      const applicablePermissions = permissions.filter((permission) =>
        Number(permission.apply_to_all_doctypes) === 1
        || permission.applicable_for === doctype,
      );
      const allowedCompanyNames = applicablePermissions.length
        ? [...new Set(applicablePermissions.map((permission) => permission.for_value))]
        : null;
      const roles = new Set((profile.roles ?? []).map(({ role }) => role));
      const canChangeCompany = companyMetadata.permissions?.some((permission) =>
        roles.has(permission.role)
        && Number(permission.write) === 1
        && Number(permission.if_owner ?? 0) === 0
        && Number(permission.permlevel ?? 0) === 0,
      ) ?? false;
      return { allowedCompanyNames, canChangeCompany };
    }));
  }
}
